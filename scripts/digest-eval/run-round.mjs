#!/usr/bin/env node
/**
 * Digest eval, a configured round (e.g. round2.json): every candidate summarizes every bill `runs` times (once
 * for bills in `singleRunBills`, the giants), so consistency can be measured. Candidates marked `batch` submit all
 * their single-pass and per-part requests as one OpenRouter batch (about half price, results usually within
 * minutes, at most 24 hours); the one combine call per long bill then runs on the normal API. Results go to
 * artifacts/digest-eval/out/<round>/<candidate>/<bill>-r<n>.json; existing files are kept (RERUN=1 redoes).
 *
 * Usage: node scripts/digest-eval/run-round.mjs scripts/digest-eval/round2.json [candidate-key ...]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { combineMessages, partMessages, PROMPT_VERSION, singlePassMessages } from './prompts.mjs'
import { parseJsonReply } from './run.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const billsDir = join(root, 'artifacts', 'digest-eval', 'bills')

function devVar(name) {
  if (process.env[name]) return process.env[name]
  const vars = readFileSync(join(root, 'workers/senate_data_worker/.dev.vars'), 'utf8')
  return vars.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim()
}
const KEY = devVar('OPENROUTER_API_KEY')
const API = 'https://openrouter.ai/api/v1'
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-Title': 'trackcongress digest eval' }
const CALL_TIMEOUT_MS = 240_000

/** Request body for one call, shaped by the candidate (reasoning effort, temperature, token cap). */
function body(candidate, messages, fallbackMax) {
  const b = { messages, max_tokens: candidate.maxTokens ?? fallbackMax }
  if (candidate.temperature != null) b.temperature = candidate.temperature
  else if (!candidate.reasoning && !candidate.batch) b.temperature = 0.2
  if (candidate.reasoning) b.reasoning = candidate.reasoning
  return b
}

export async function chat(candidate, messages, fallbackMax) {
  const started = Date.now()
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${API}/chat/completions`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        body: JSON.stringify({
          model: candidate.model,
          ...(candidate.provider ? { provider: candidate.provider } : {}),
          ...body(candidate, messages, fallbackMax),
          usage: { include: true },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.choices?.[0]) throw new Error(json.error?.message ?? `HTTP ${res.status}`)
      return {
        json: parseJsonReply(json.choices[0].message.content),
        cost: json.usage?.cost ?? 0,
        tokensIn: json.usage?.prompt_tokens ?? 0,
        tokensOut: json.usage?.completion_tokens ?? 0,
        ms: Date.now() - started,
        attempts: attempt,
        provider: json.provider ?? null,
      }
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  throw new Error(`failed after 3 tries: ${lastError?.message}`)
}

/** Submit one batch, poll until it ends, return results by custom_id. */
async function runBatch(candidate, requests) {
  const submit = await fetch(`${API}/batches`, {
    method: 'POST',
    headers,
    // endpoint, model and provider must come before requests in the body.
    body: JSON.stringify({ endpoint: '/v1/chat/completions', model: candidate.model.endsWith(':batch') ? candidate.model : `${candidate.model}:batch`, requests }),
  })
  const created = await submit.json()
  if (!submit.ok) throw new Error(`batch submit failed: ${JSON.stringify(created).slice(0, 300)}`)
  console.log(`  ${candidate.key}: batch ${created.id} submitted with ${requests.length} requests`)
  const started = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, 30_000))
    const res = await fetch(`${API}/batches/${created.id}`, { headers })
    const batch = await res.json()
    const c = batch.request_counts ?? {}
    console.log(`  ${candidate.key}: ${batch.status} ${c.completed ?? 0}/${c.total ?? '?'} done, ${c.failed ?? 0} failed, ${Math.round((Date.now() - started) / 60000)} min`)
    if (['completed', 'failed', 'expired', 'cancelled'].includes(batch.status)) {
      const byId = new Map()
      for (const r of batch.results ?? []) byId.set(r.custom_id, r)
      return { id: created.id, status: batch.status, usage: batch.usage, byId, minutes: (Date.now() - started) / 60000 }
    }
  }
}

function fromBatchResult(r) {
  if (!r || r.error || r.response?.status_code !== 200) {
    throw new Error(r?.error?.message ?? r?.error ?? `status ${r?.response?.status_code ?? 'missing'}`)
  }
  const b = r.response.body
  return {
    json: parseJsonReply(b.choices?.[0]?.message?.content),
    cost: b.usage?.cost ?? 0,
    tokensIn: b.usage?.prompt_tokens ?? 0,
    tokensOut: b.usage?.completion_tokens ?? 0,
    ms: null,
    attempts: 1,
    provider: b.provider ?? null,
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }))
  return out
}

async function runCandidate(config, candidate) {
  const dir = join(root, 'artifacts', 'digest-eval', 'out', config.round, candidate.key)
  mkdirSync(dir, { recursive: true })
  const jobs = []
  for (const id of config.bills) {
    const bill = JSON.parse(readFileSync(join(billsDir, `${id}.json`), 'utf8'))
    const runs = config.singleRunBills?.includes(id) ? 1 : config.runs
    for (let run = 1; run <= runs; run += 1) {
      const file = join(dir, `${id}-r${run}.json`)
      if (existsSync(file) && !process.env.RERUN) continue
      jobs.push({ id, run, bill, file })
    }
  }
  if (jobs.length === 0) return console.log(`  ${candidate.key}: nothing to do`)

  // Every first-pass request: whole bill, or one per part of a long bill.
  const requests = []
  for (const job of jobs) {
    if (job.bill.parts.length === 0) requests.push({ custom_id: `${job.id}::r${job.run}::single`, messages: singlePassMessages(job.bill), max: 4000 })
    else job.bill.parts.forEach((part, i) => requests.push({ custom_id: `${job.id}::r${job.run}::part${i}`, messages: partMessages(job.bill, part), max: 4000 }))
  }

  const results = new Map()
  let batchInfo = null
  const started = Date.now()
  if (candidate.batch) {
    const batch = await runBatch(candidate, requests.map((r) => ({ custom_id: r.custom_id, body: body(candidate, r.messages, r.max) })))
    batchInfo = { id: batch.id, status: batch.status, minutes: Math.round(batch.minutes * 10) / 10, cost: batch.usage?.cost ?? null }
    for (const r of requests) {
      try {
        results.set(r.custom_id, fromBatchResult(batch.byId.get(r.custom_id)))
      } catch (err) {
        results.set(r.custom_id, { error: err.message })
      }
    }
  } else {
    await mapLimit(requests, 4, async (r) => {
      try {
        results.set(r.custom_id, await chat(candidate, r.messages, r.max))
      } catch (err) {
        results.set(r.custom_id, { error: err.message })
      }
    })
  }

  for (const job of jobs) {
    const base = { round: config.round, candidate: candidate.key, model: candidate.model, promptVersion: PROMPT_VERSION, mode: candidate.batch ? 'batch' : 'normal', id: job.id, run: job.run, batch: batchInfo }
    try {
      if (job.bill.parts.length === 0) {
        const r = results.get(`${job.id}::r${job.run}::single`)
        if (r.error) throw new Error(r.error)
        writeFileSync(job.file, JSON.stringify({ ...base, summary: r.json, calls: [r], parts: [], cost: r.cost }, null, 2))
      } else {
        const partResults = job.bill.parts.map((part, i) => ({ label: part.label, r: results.get(`${job.id}::r${job.run}::part${i}`) }))
        const notes = partResults.filter((p) => p.r && !p.r.error).map((p) => ({ label: p.label, ...p.r.json }))
        if (notes.length === 0) throw new Error('every part failed')
        const combined = await chat(candidate, combineMessages(job.bill, notes), 6000)
        const calls = [...partResults.filter((p) => p.r && !p.r.error).map((p) => p.r), combined]
        writeFileSync(job.file, JSON.stringify({
          ...base,
          summary: combined.json,
          calls,
          parts: partResults.map((p) => ({ label: p.label, notes: p.r?.json ?? null, error: p.r?.error ?? null })),
          cost: calls.reduce((s, c) => s + (c.cost || 0), 0),
        }, null, 2))
      }
      const saved = JSON.parse(readFileSync(job.file, 'utf8'))
      console.log(`  ${candidate.key.padEnd(22)} ${job.id.padEnd(13)} r${job.run} ok  $${saved.cost.toFixed(4)}  ${saved.summary.headline}`)
    } catch (err) {
      writeFileSync(job.file, JSON.stringify({ ...base, error: err.message }, null, 2))
      console.log(`  ${candidate.key.padEnd(22)} ${job.id.padEnd(13)} r${job.run} FAIL ${err.message.slice(0, 140)}`)
    }
  }
  console.log(`  ${candidate.key}: finished in ${Math.round((Date.now() - started) / 6000) / 10} min${batchInfo ? ` (batch ${batchInfo.status}, reported cost $${batchInfo.cost ?? '?'})` : ''}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const only = process.argv.slice(3)
  const candidates = config.candidates.filter((c) => only.length === 0 || only.includes(c.key))
  await Promise.all(candidates.map((c) => runCandidate(config, c).catch((err) => console.log(`  ${c.key}: RUN FAILED ${err.message}`))))
}

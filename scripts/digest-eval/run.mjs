#!/usr/bin/env node
/**
 * Digest eval, step 2: summarize each fetched bill with each model. Long bills (bill.parts) run one call per
 * part in parallel, then a combine call. Results (JSON, cost, latency, errors) are cached per model and bill in
 * artifacts/digest-eval/out/<model>/<id>.json; delete a file (or set RERUN=1) to redo it.
 *
 * Env: OPENROUTER_API_KEY (defaults to workers/senate_data_worker/.dev.vars).
 * Usage: node scripts/digest-eval/run.mjs --set practice|test|all --models openai/gpt-6-luna,z-ai/glm-5.3-flash [ids...]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { combineMessages, partMessages, singlePassMessages } from './prompts.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const billsDir = join(root, 'artifacts', 'digest-eval', 'bills')
const outRoot = join(root, 'artifacts', 'digest-eval', 'out')

function devVar(name) {
  if (process.env[name]) return process.env[name]
  const vars = readFileSync(join(root, 'workers/senate_data_worker/.dev.vars'), 'utf8')
  return vars.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim()
}
const KEY = devVar('OPENROUTER_API_KEY')

/** Pull the JSON object out of a reply that may carry code fences or stray text around it. */
export function parseJsonReply(content) {
  const text = String(content ?? '').replace(/```(?:json)?/g, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON object in reply')
  return JSON.parse(text.slice(start, end + 1))
}

/** A stalled provider must not hang the run; the call is retried, then reported as failed. */
const CALL_TIMEOUT_MS = 180_000

async function chat(model, messages, maxTokens) {
  const started = Date.now()
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let res
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-Title': 'trackcongress digest eval' },
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens, usage: { include: true } }),
      })
    } catch (err) {
      if (attempt === 3) throw new Error(`no response after ${attempt} tries: ${err.message}`)
      continue
    }
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.choices?.[0]?.message) {
      const content = body.choices[0].message.content
      try {
        return {
          json: parseJsonReply(content),
          cost: body.usage?.cost ?? 0,
          tokensIn: body.usage?.prompt_tokens ?? 0,
          tokensOut: body.usage?.completion_tokens ?? 0,
          ms: Date.now() - started,
          attempts: attempt,
        }
      } catch (err) {
        if (attempt === 3) throw new Error(`unparseable reply: ${err.message}: ${String(content).slice(0, 200)}`)
        continue
      }
    }
    const message = body.error?.message ?? `HTTP ${res.status}`
    if (attempt === 3 || (res.status >= 400 && res.status < 500 && res.status !== 429)) throw new Error(message)
    await new Promise((r) => setTimeout(r, 2000 * attempt))
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i], i)
      }
    }),
  )
  return results
}

async function summarize(model, bill) {
  if (!bill.parts?.length) {
    const r = await chat(model, singlePassMessages(bill), 4000)
    return { summary: r.json, calls: [r], parts: [] }
  }
  const partCalls = await mapLimit(bill.parts, 4, async (part) => {
    try {
      const r = await chat(model, partMessages(bill, part), 4000)
      return { label: part.label, notes: r.json, call: r }
    } catch (err) {
      return { label: part.label, error: err.message }
    }
  })
  const notes = partCalls.filter((p) => p.notes).map((p) => ({ label: p.label, ...p.notes }))
  if (notes.length === 0) throw new Error('every part failed')
  const combined = await chat(model, combineMessages(bill, notes), 6000)
  return {
    summary: combined.json,
    calls: [...partCalls.filter((p) => p.call).map((p) => p.call), combined],
    parts: partCalls.map(({ label, notes: n, error }) => ({ label, notes: n ?? null, error: error ?? null })),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args.splice(i, 2)[1] : null
  }
  const set = flag('set') ?? 'practice'
  const models = (flag('models') ?? 'openai/gpt-6-luna').split(',').map((m) => m.trim())
  const lists = JSON.parse(readFileSync(join(here, 'bills.json'), 'utf8'))
  const ids = args.length ? args : (set === 'all' ? [...lists.practice, ...lists.test] : lists[set]).map((b) => b.id)

  let total = 0
  await Promise.all(
    models.map(async (model) => {
      const dir = join(outRoot, model.replace(/[/:]/g, '_'))
      mkdirSync(dir, { recursive: true })
      for (const id of ids) {
        const file = join(dir, `${id}.json`)
        if (existsSync(file) && !process.env.RERUN) continue
        const bill = JSON.parse(readFileSync(join(billsDir, `${id}.json`), 'utf8'))
        const started = Date.now()
        try {
          const result = await summarize(model, bill)
          const cost = result.calls.reduce((s, c) => s + (c.cost || 0), 0)
          total += cost
          writeFileSync(file, JSON.stringify({ model, id, ms: Date.now() - started, cost, ...result }, null, 2))
          console.log(`${model.padEnd(36)} ${id.padEnd(14)} ok   $${cost.toFixed(4)}  ${((Date.now() - started) / 1000).toFixed(1)}s  ${result.summary.headline}`)
        } catch (err) {
          writeFileSync(file, JSON.stringify({ model, id, error: err.message }, null, 2))
          console.log(`${model.padEnd(36)} ${id.padEnd(14)} FAIL ${err.message.slice(0, 120)}`)
        }
      }
    }),
  )
  console.log(`total cost this run: $${total.toFixed(4)}`)
}

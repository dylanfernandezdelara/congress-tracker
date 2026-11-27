#!/usr/bin/env node
/**
 * Eval rounds run by the production worker (workers/senate_data_worker/src/eval/run-eval.ts), so they use the worker's
 * own OpenRouter key and never need one on this machine. A request is a row in the production eval_requests table;
 * the worker's one-minute cron picks it up. Talks to D1 through `wrangler d1 execute --remote` (this machine's login).
 *
 *   node scripts/digest-eval/remote.mjs estimate <round.json>             cost estimate, nothing sent
 *   node scripts/digest-eval/remote.mjs request <round.json> --cap 1      queue the round (spends up to the cap)
 *   node scripts/digest-eval/remote.mjs status [request-id]               progress and spend
 *   node scripts/digest-eval/remote.mjs fetch <request-id>                save outputs to artifacts/digest-eval/out/<round>/
 *
 * The round file is the worker's EvalSpec: { round, bills: ["119-hr-2140", ...], runs?, crs?: "hidden"|"given",
 * candidates: [{ key, model, price: {input, output}, reasoning?, temperature?, maxTokens? }] }.
 * Estimates need each bill's file from fetch-bills.mjs (it reads Congress.gov with CONGRESS_API_KEY).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const workerDir = join(root, 'workers/senate_data_worker')
const billsDir = join(root, 'artifacts', 'digest-eval', 'bills')

/** Prompt and rules ahead of the bill (v3.4 runs ~3k tokens). The worst case assumes each candidate's full output
 * allowance, as the worker's cap check does. */
const PROMPT_TOKENS = 3_500
const LIKELY_OUTPUT_TOKENS = 1_800

const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`

function d1(sql) {
  const out = execFileSync(join(workerDir, 'node_modules/.bin/wrangler'), ['d1', 'execute', 'congress-tracker', '--remote', '--json', '--command', sql], {
    cwd: workerDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(out.slice(out.search(/^\[/m)))[0]?.results ?? []
}

function loadSpec(file) {
  const spec = JSON.parse(readFileSync(file, 'utf8'))
  if (!spec.round || !Array.isArray(spec.bills) || !Array.isArray(spec.candidates)) throw new Error('round file needs round, bills, candidates')
  for (const c of spec.candidates) if (!c.key || !c.model || !c.price) throw new Error(`candidate needs key, model, price: ${JSON.stringify(c)}`)
  return spec
}

function estimate(spec) {
  const missing = spec.bills.filter((b) => !existsSync(join(billsDir, `${b}.json`)))
  if (missing.length) {
    execFileSync(process.execPath, [join(here, 'fetch-bills.mjs'), ...missing], { stdio: 'inherit' })
  }
  const runs = Math.max(1, spec.runs ?? 1)
  const rows = []
  let worst = 0
  let likely = 0
  for (const c of spec.candidates) {
    let w = 0
    let l = 0
    for (const id of spec.bills) {
      const bill = JSON.parse(readFileSync(join(billsDir, `${id}.json`), 'utf8'))
      if (bill.parts?.length) throw new Error(`${id} is a long bill (split into parts); eval rounds take single-pass bills only`)
      const input = PROMPT_TOKENS + (bill.tokens ?? 0)
      w += (input * c.price.input + (c.maxTokens ?? 12_000) * c.price.output) / 1e6
      l += (input * c.price.input + LIKELY_OUTPUT_TOKENS * c.price.output) / 1e6
    }
    rows.push({ candidate: c.key, model: c.model, calls: spec.bills.length * runs, likely_usd: +(l * runs).toFixed(4), worst_usd: +(w * runs).toFixed(4) })
    worst += w * runs
    likely += l * runs
  }
  return { rows, likely: +likely.toFixed(4), worst: +worst.toFixed(4), calls: spec.bills.length * spec.candidates.length * runs }
}

function printEstimate(spec, e) {
  console.log(`round ${spec.round}: ${spec.bills.length} bills × ${spec.candidates.length} candidates × ${spec.runs ?? 1} run(s) = ${e.calls} calls, CRS ${spec.crs ?? 'hidden'}`)
  console.table(e.rows)
  console.log(`likely ~$${e.likely}, at most ~$${e.worst} (each call's full output allowance, which the worker's cap check also assumes)`)
}

const [cmd, arg, ...rest] = process.argv.slice(2)
const flag = (name) => {
  const i = rest.indexOf(name)
  return i >= 0 ? rest[i + 1] : undefined
}

if (cmd === 'estimate') {
  const spec = loadSpec(arg)
  printEstimate(spec, estimate(spec))
} else if (cmd === 'request') {
  const spec = loadSpec(arg)
  const cap = Number(flag('--cap'))
  if (!(cap > 0)) throw new Error('pass --cap <usd>: the most this round may spend')
  const e = estimate(spec)
  printEstimate(spec, e)
  if (e.worst > cap) console.log(`note: the worst case is above the cap; the worker stops at $${cap} and reports what is left`)
  const id = `${spec.round}-${randomUUID().slice(0, 8)}`
  d1(
    `INSERT INTO eval_requests (id, spec_json, cap_usd, state, spent_usd, created_at) VALUES (${sqlString(id)}, ${sqlString(JSON.stringify(spec))}, ${cap}, 'queued', 0, ${sqlString(new Date().toISOString())})`
  )
  console.log(`queued ${id}; the worker starts it within a minute. Check: node scripts/digest-eval/remote.mjs status ${id}`)
} else if (cmd === 'status') {
  const where = arg ? `WHERE r.id = ${sqlString(arg)}` : ''
  const rows = d1(
    `SELECT r.id, r.state, r.cap_usd, r.spent_usd, r.error, r.created_at, r.finished_at,
       (SELECT COUNT(*) FROM eval_outputs o WHERE o.request_id = r.id) AS written,
       (SELECT COUNT(*) FROM eval_outputs o WHERE o.request_id = r.id AND o.state = 'ok') AS ok,
       (SELECT COUNT(*) FROM eval_outputs o WHERE o.request_id = r.id AND o.state = 'rejected') AS rejected,
       (SELECT COUNT(*) FROM eval_outputs o WHERE o.request_id = r.id AND o.state = 'failed') AS failed
     FROM eval_requests r ${where} ORDER BY r.created_at DESC LIMIT 10`
  )
  console.table(rows)
} else if (cmd === 'fetch') {
  const [req] = d1(`SELECT id, spec_json FROM eval_requests WHERE id = ${sqlString(arg)}`)
  if (!req) throw new Error(`no request ${arg}`)
  const spec = JSON.parse(req.spec_json)
  const rows = d1(`SELECT * FROM eval_outputs WHERE request_id = ${sqlString(arg)} ORDER BY bill_id, candidate, run`)
  for (const r of rows) {
    const dir = join(root, 'artifacts', 'digest-eval', 'out', spec.round, r.candidate)
    mkdirSync(dir, { recursive: true })
    const inputs = r.inputs_json ? JSON.parse(r.inputs_json) : null
    writeFileSync(
      join(dir, `${r.bill_id}-r${r.run}.json`),
      JSON.stringify(
        {
          round: spec.round,
          candidate: r.candidate,
          model: r.model,
          promptVersion: inputs?.prompt_version ?? null,
          mode: 'remote',
          request: r.request_id,
          id: r.bill_id,
          run: r.run,
          batch: false,
          state: r.state,
          summary: r.summary_json ? JSON.parse(r.summary_json) : null,
          blocking: r.blocking_json ? JSON.parse(r.blocking_json) : [],
          warnings: r.warnings_json ? JSON.parse(r.warnings_json) : [],
          error: r.error,
          content: r.content,
          calls: 1,
          parts: 0,
          cost: r.cost,
          usage: { prompt_tokens: r.prompt_tokens, completion_tokens: r.completion_tokens },
          inputs,
        },
        null,
        2
      )
    )
  }
  console.log(`saved ${rows.length} outputs to artifacts/digest-eval/out/${spec.round}/`)
} else {
  console.error('usage: remote.mjs estimate|request|status|fetch ... (see the header of this file)')
  process.exit(2)
}

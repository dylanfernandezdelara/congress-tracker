#!/usr/bin/env node
/**
 * Run the calibrated judge over every summary of a round (all runs), plus the deterministic checks, and report
 * per candidate: pass rate, failures by dimension, and consistency (all runs of a bill pass: pass^k).
 * Usage: node scripts/digest-eval/judge-round.mjs scripts/digest-eval/round2.json
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { JUDGE } from './calibrate-judge.mjs'
import { checkSummary } from './checks.mjs'
import { judgeMessages, judgePassed, JUDGE_DIMENSIONS } from './judge.mjs'
import { chat } from './run-round.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const evalDir = join(here, '..', '..', 'artifacts', 'digest-eval')
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const outFile = join(evalDir, 'judge', `${config.round}.json`)
mkdirSync(dirname(outFile), { recursive: true })

const items = []
for (const c of config.candidates) {
  const dir = join(evalDir, 'out', config.round, c.key)
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir)) {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    items.push({ candidate: c.key, id: r.id, run: r.run, result: r })
  }
}

let next = 0
const out = []
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < items.length) {
    const it = items[next++]
    const bill = JSON.parse(readFileSync(join(evalDir, 'bills', `${it.id}.json`), 'utf8'))
    if (!it.result.summary) {
      out.push({ ...it, result: undefined, failed: it.result.error, verdict: null, checks: null })
      continue
    }
    const summary = { ...it.result.summary, key_points: (it.result.summary.key_points ?? []).map((k) => (typeof k === 'string' ? { text: k, section: null } : k)) }
    const checks = checkSummary(summary, bill, { long: bill.parts.length > 0 })
    let verdict = null
    let cost = 0
    try {
      const r = await chat(JUDGE, judgeMessages(bill, summary), 3000)
      verdict = r.json
      cost = r.cost
    } catch (err) {
      verdict = { error: err.message }
    }
    out.push({ candidate: it.candidate, id: it.id, run: it.run, verdict, checks, judgeCost: cost })
  }
}))

const report = {}
for (const c of config.candidates) {
  const mine = out.filter((o) => o.candidate === c.key)
  const judged = mine.filter((o) => o.verdict && !o.verdict.error)
  const byBill = {}
  for (const o of mine) (byBill[o.id] ??= []).push(o)
  const consistent = Object.values(byBill).filter((runs) => runs.every((o) => o.verdict && judgePassed(o.verdict))).length
  report[c.key] = {
    failed_to_produce: mine.filter((o) => o.failed).length,
    judge_pass: `${judged.filter((o) => judgePassed(o.verdict)).length}/${judged.length}`,
    all_runs_pass_per_bill: `${consistent}/${Object.keys(byBill).length}`,
    fails_by_dimension: Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, judged.filter((o) => o.verdict[d] === 'fail').length])),
    check_flags: mine.reduce((n, o) => n + (o.checks?.flags.filter((f) => !f.startsWith('minor')).length ?? 0), 0),
  }
}
writeFileSync(outFile, JSON.stringify({ round: config.round, judge: JUDGE.model, report, items: out }, null, 2))
console.log(JSON.stringify({ judgeCost: `$${out.reduce((n, o) => n + (o.judgeCost || 0), 0).toFixed(3)}`, report }, null, 2))

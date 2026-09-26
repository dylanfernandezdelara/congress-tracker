#!/usr/bin/env node
/**
 * Blind review page for a configured round (e.g. round2.json): per bill, each candidate's first run, shuffled and
 * labeled A–E. Judge verdicts for every run (and whether all runs passed) ride along but are shown only after
 * "Show models", so the human pick stays independent and can calibrate the judge.
 * Usage: node scripts/digest-eval/build-review-round.mjs scripts/digest-eval/round2.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkSummary } from './checks.mjs'
import { judgePassed, JUDGE_DIMENSIONS } from './judge.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const evalDir = join(here, '..', '..', 'artifacts', 'digest-eval')
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const judged = existsSync(join(evalDir, 'judge', `${config.round}.json`)) ? JSON.parse(readFileSync(join(evalDir, 'judge', `${config.round}.json`), 'utf8')).items : []

function shuffle(items, seed) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    const j = h % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const label = (b) => `${b.type.replace('HCONRES', 'H.Con.Res.').replace('HJRES', 'H.J.Res.').replace('HRES', 'H.Res.').replace('HR', 'H.R.').replace(/^S$/, 'S.')} ${b.number}`
const bills = config.bills.map((id) => {
  const bill = JSON.parse(readFileSync(join(evalDir, 'bills', `${id}.json`), 'utf8'))
  const candidates = []
  for (const c of config.candidates) {
    const file = join(evalDir, 'out', config.round, c.key, `${id}-r1.json`)
    if (!existsSync(file)) continue
    const r = JSON.parse(readFileSync(file, 'utf8'))
    const summary = r.summary ? { ...r.summary, key_points: (r.summary.key_points ?? []).map((k) => (typeof k === 'string' ? { text: k, section: null } : k)) } : null
    const check = summary ? checkSummary(summary, bill, { long: bill.parts.length > 0 }) : { flags: [`failed: ${r.error}`], grade: null }
    const runs = judged.filter((j) => j.candidate === c.key && j.id === id).sort((a, b) => a.run - b.run).map((j) => ({
      run: j.run,
      passed: j.verdict ? judgePassed(j.verdict) : false,
      fails: j.verdict ? JUDGE_DIMENSIONS.filter((d) => j.verdict[d] === 'fail') : ['no summary'],
      reason: j.verdict?.reason ?? j.failed ?? null,
    }))
    candidates.push({
      model: c.key,
      summary: summary ? { ...summary, inside: summary.inside ?? [] } : null,
      error: r.error ?? null,
      flags: check.flags,
      grade: check.grade,
      cost: r.cost ?? 0,
      seconds: null,
      judge: runs.length ? { runs, consistent: `${runs.filter((x) => x.passed).length}/${runs.length} runs pass` } : null,
    })
  }
  return {
    id,
    set: 'test',
    why: config.why?.[id] ?? '',
    label: label(bill),
    title: bill.title,
    status: bill.status.label,
    text: bill.text ? `${Math.max(1, Math.round(bill.tokens / 330))} page${bill.tokens > 500 ? 's' : ''} of text (${bill.textVersion.type})` : 'No text published yet',
    crs: bill.crs ? 'CRS summary available' : 'No CRS summary yet',
    parts: bill.parts.length,
    url: `https://www.congress.gov/bill/${bill.congress}th-congress/${{ HR: 'house-bill', S: 'senate-bill', HRES: 'house-resolution', HJRES: 'house-joint-resolution', HCONRES: 'house-concurrent-resolution' }[bill.type]}/${bill.number}`,
    candidates: shuffle(candidates, `${config.round}:${id}`).map((c, i) => ({ ...c, letter: 'ABCDE'[i] })),
  }
})

const data = { round: config.round, models: Object.fromEntries(config.candidates.map((c) => [c.key, c.name])), bills }
const template = readFileSync(join(here, 'review-template.html'), 'utf8')
const html = template.replace('/*DATA*/null', JSON.stringify(data).replace(/</g, '\\u003c'))
mkdirSync(join(evalDir, 'review'), { recursive: true })
writeFileSync(join(evalDir, 'review', `${config.round}.html`), html)
console.log(`review page: ${bills.length} bills → artifacts/digest-eval/review/${config.round}.html`)

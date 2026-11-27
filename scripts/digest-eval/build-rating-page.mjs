#!/usr/bin/env node
/**
 * Build a blind rating page for one eval round: for each bill, the rater reads one summary and answers a question
 * about the bill, then picks a favorite from a few summaries side by side (the official CRS summary always among
 * them). Output is one HTML file to publish as an Artifact (it stores answers with the db capability).
 *
 *   node scripts/digest-eval/build-rating-page.mjs <round.json> <questions.json> <out.html> [--compare 3] [--title "..."]
 *   node scripts/digest-eval/build-rating-page.mjs <round.json> - <out.html> --rank [--compare 4] [--no-crs]
 *
 * --rank: no read-first question; the rater ranks every summary shown, best first (each ranking of 4 is 6 pairwise
 * results, twice a favorite's 3). --no-crs leaves the CRS summary out of the comparison. With `runs` > 1 in the
 * round, bill i shows run (i mod runs) + 1, so both runs get rated.
 *
 * Reads artifacts/digest-eval/out/<round>/<candidate>/<bill>-r1.json (remote.mjs fetch) and the bill files.
 * Only summaries that passed the checks are shown: a blocked one would never reach the site.
 * Each bill's comparison is the CRS summary plus `--compare` models, rotated so every model is compared about
 * equally often; the summary read first rotates over every contestant, CRS included.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const [roundFile, questionsFile, outFile, ...rest] = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = rest.indexOf(name)
  return i >= 0 ? rest[i + 1] : fallback
}
if (!roundFile || !questionsFile || !outFile) {
  console.error('usage: build-rating-page.mjs <round.json> <questions.json> <out.html> [--compare 3] [--title "..."]')
  process.exit(2)
}

const spec = JSON.parse(readFileSync(roundFile, 'utf8'))
const questions = questionsFile === '-' ? {} : JSON.parse(readFileSync(questionsFile, 'utf8'))
const rank = rest.includes('--rank')
const withCrs = !rest.includes('--no-crs')
const perBill = Number(opt('--compare', rank ? (withCrs ? '3' : '4') : '3'))
const runs = Math.max(1, spec.runs ?? 1)
const title = opt('--title', 'Summary Rating')

/** Reader-facing names, revealed only on the results screen. */
const NAMES = {
  crs: 'Congressional Research Service (official)',
  luna: 'GPT-6 Luna (current model)',
  'luna-pro': 'GPT-6 Luna Pro',
  'haiku-5-5': 'Claude Haiku 5.5',
  'muse-ember': 'Meta Muse Ember',
  'gemini-4-hydrogen': 'Gemini 4 Hydrogen',
  'deepseek-v4-1-flash': 'DeepSeek V4.1 Flash',
}
// Round 9 style keys: <model>-<prompt version>.
const PROMPTS = { v34: 'current prompt', v4: 'v4: reader focus', 'v4-plan': 'v4 + answer reader questions first', 'v4-facts': 'v4 + list facts first' }
for (const c of spec.candidates) {
  if (NAMES[c.key]) continue
  const m = /^(luna|muse-ember)-(v34|v4|v4-plan|v4-facts)$/.exec(c.key)
  if (m) NAMES[c.key] = `${m[1] === 'luna' ? 'GPT-6 Luna' : 'Meta Muse Ember'}, ${PROMPTS[m[2]]}`
}

const label = (b) =>
  `${b.type.replace('HCONRES', 'H.Con.Res.').replace('SCONRES', 'S.Con.Res.').replace('HJRES', 'H.J.Res.').replace('SJRES', 'S.J.Res.').replace('HRES', 'H.Res.').replace('SRES', 'S.Res.').replace(/^HR$/, 'H.R.').replace(/^S$/, 'S.')} ${b.number}`

const models = spec.candidates.map((c) => c.key)
const skipped = []
const bills = spec.bills.map((id, i) => {
  if (!rank && !questions[id]) throw new Error(`no question for ${id}`)
  const run = (i % runs) + 1
  const bill = JSON.parse(readFileSync(join(root, 'artifacts/digest-eval/bills', `${id}.json`), 'utf8'))
  const entries = []
  for (const key of models) {
    const f = join(root, 'artifacts/digest-eval/out', spec.round, key, `${id}-r${run}.json`)
    if (!existsSync(f)) {
      skipped.push(`${id} ${key}: no output`)
      continue
    }
    const out = JSON.parse(readFileSync(f, 'utf8'))
    if (out.state !== 'ok' || !out.summary) {
      skipped.push(`${id} ${key}: ${out.state} (${(out.blocking ?? []).join('; ') || out.error || 'no summary'})`)
      continue
    }
    entries.push({ src: key, summary: out.summary })
  }
  if (withCrs) {
    if (!bill.crs?.text) throw new Error(`${id} has no CRS summary`)
    entries.push({ src: 'crs', summary: { crs: bill.crs.text } })
  }
  // Models for this bill's comparison: a window that slides one model per bill, skipping ones without a summary.
  const has = (m) => entries.some((e) => e.src === m)
  // Windows over every model step by `perBill` (each model equally often) and shift one place every second bill
  // (varied partners). A model with no usable summary here gives its place to the next model after the window.
  const start = (i * perBill + Math.floor(i / 2)) % models.length
  const picked = []
  for (let k = 0; k < models.length && picked.length < perBill; k += 1) {
    const m = models[(start + k) % models.length]
    if (has(m)) picked.push(m)
  }
  const compare = [...picked, ...(withCrs ? ['crs'] : [])].map((src) => entries.findIndex((e) => e.src === src))
  return { id, label: label(bill), title: bill.title, run, entries, compare }
})

const page = { bills, questions, names: NAMES, mode: rank ? 'rank' : 'pick', storageKey: `rating:${spec.round}` }
const b64 = Buffer.from(JSON.stringify(page)).toString('base64')
const head = readFileSync(join(here, 'rating-page/head.html'), 'utf8').replace('__TITLE__', title).replace('__ROUND__', spec.round)
const app = readFileSync(join(here, 'rating-page/app.js'), 'utf8')
writeFileSync(outFile, `${head}\n<script>\nconst PAGE_B64 = "${b64}";\n${app}</script>\n`)

const counts = Object.fromEntries(models.map((m) => [m, bills.filter((b) => b.compare.some((k) => b.entries[k].src === m)).length]))
console.log(`wrote ${outFile}: ${bills.length} bills; times each model is compared:`, counts)
if (skipped.length) console.log(`left out (blocked or failed):\n  ${skipped.join('\n  ')}`)

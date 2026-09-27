#!/usr/bin/env node
/**
 * Digest eval, step 3: build the blind review page (artifacts/digest-eval/review/index.html). For each bill, every
 * model's summary plus today's production digest, in a per-bill shuffled order labeled A–E, with the automatic
 * check flags. Picks ("best", "has an error", a note) are saved to the page's db (judgments/<round>-<bill>), so they
 * can be read back and become the benchmark for later prompt or model changes.
 * Usage: node scripts/digest-eval/build-review.mjs [round]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkSummary } from './checks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const evalDir = join(root, 'artifacts', 'digest-eval')
const round = process.argv[2] ?? 'round1'

const MODEL_NAMES = {
  baseline_production: 'Production today (free model, title or CRS only)',
  'openai_gpt-6-luna': 'GPT-6 Luna',
  'z-ai_glm-5.3-flash': 'GLM-5.3 Flash',
  'deepseek_deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
  'meta_muse-spark-1.3-contributor': 'Muse Spark 1.3 Contributor',
}

/** Deterministic shuffle per bill so the order is stable across rebuilds but carries no model signal. */
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

const lists = JSON.parse(readFileSync(join(here, 'bills.json'), 'utf8'))
const models = readdirSync(join(evalDir, 'out')).filter((d) => MODEL_NAMES[d])
const bills = []
for (const [set, entries] of [['practice', lists.practice], ['test', lists.test]]) {
  for (const { id, why } of entries) {
    const bill = JSON.parse(readFileSync(join(evalDir, 'bills', `${id}.json`), 'utf8'))
    const long = bill.parts.length > 0
    const partTokens = Object.fromEntries(bill.parts.map((p) => [p.label, p.tokens]))
    const candidates = []
    for (const model of models) {
      const file = join(evalDir, 'out', model, `${id}.json`)
      if (!existsSync(file)) continue
      const r = JSON.parse(readFileSync(file, 'utf8'))
      const check = r.summary ? checkSummary(r.summary, bill, { long }) : { flags: [`failed: ${r.error}`], grade: null }
      const points = (r.summary?.key_points ?? []).map((k) => (typeof k === 'string' ? { text: k, section: null } : k))
      // "What's inside" rows get a size from the parts they cite (share of the bill's text), never from the model.
      const inside = (r.summary?.inside ?? []).map((row) => {
        const tokens = bill.parts
          .filter((p) => row.section && p.label.toLowerCase().startsWith(String(row.section).toLowerCase().split('/')[0].trim()))
          .reduce((n, p) => n + p.tokens, 0)
        return { ...row, share: tokens && bill.tokens ? Math.round((tokens / bill.tokens) * 100) : null }
      })
      candidates.push({
        model,
        summary: r.summary ? { ...r.summary, key_points: points, inside } : null,
        error: r.error ?? null,
        flags: check.flags,
        grade: check.grade,
        cost: r.cost ?? 0,
        seconds: r.ms ? Math.round(r.ms / 100) / 10 : null,
        source: r.source ?? null,
      })
    }
    const order = shuffle(candidates, `${round}:${id}`)
    bills.push({
      id,
      set,
      why,
      label: `${bill.type.replace('HCONRES', 'H.Con.Res.').replace('HJRES', 'H.J.Res.').replace('HRES', 'H.Res.').replace('HR', 'H.R.').replace(/^S$/, 'S.')} ${bill.number}`,
      title: bill.title,
      status: bill.status.label,
      sponsor: bill.sponsor?.name ?? null,
      text: bill.text ? `${Math.max(1, Math.round(bill.tokens / 330))} page${bill.tokens > 500 ? 's' : ''} of text (${bill.textVersion.type})` : 'No text published yet',
      crs: bill.crs ? 'CRS summary available' : 'No CRS summary yet',
      parts: bill.parts.length,
      url: `https://www.congress.gov/bill/${bill.congress}th-congress/${{ HR: 'house-bill', S: 'senate-bill', HRES: 'house-resolution', HJRES: 'house-joint-resolution', HCONRES: 'house-concurrent-resolution', SRES: 'senate-resolution' }[bill.type]}/${bill.number}`,
      candidates: order.map((c, i) => ({ ...c, letter: 'ABCDE'[i] })),
    })
  }
}

const data = { round, models: Object.fromEntries(models.map((m) => [m, MODEL_NAMES[m]])), bills }
const template = readFileSync(join(here, 'review-template.html'), 'utf8')
const html = template.replace('/*DATA*/null', JSON.stringify(data).replace(/</g, '\\u003c'))
mkdirSync(join(evalDir, 'review'), { recursive: true })
writeFileSync(join(evalDir, 'review', 'index.html'), html)
console.log(`review page: ${bills.length} bills, ${models.length} sources → artifacts/digest-eval/review/index.html`)

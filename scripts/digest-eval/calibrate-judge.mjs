#!/usr/bin/env node
/**
 * Calibrate the judge model before trusting it (Anthropic: calibrate model graders against human experts; OpenAI:
 * validate agreement against human labels; "A Judge Should Know What Changed", 2026: also test sensitivity, since
 * judges often miss real changes).
 *
 * 1. Agreement: judge every round-1 summary. The human's "has an error" marks should fail; the human's "best"
 *    picks should pass. Also ask the judge to pick the best of the five per bill and compare with the human pick.
 * 2. Sensitivity: plant one known error in each human-picked best summary (a changed number, a wrong vote outcome,
 *    a judging word, a date that loses its year) and count how many the judge fails on the right dimension.
 *
 * Writes artifacts/digest-eval/judge/calibration.json (calibration-<model>[-<effort>].json for a trial judge). Usage: node scripts/digest-eval/calibrate-judge.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { judgeMessages, judgePassed, JUDGE_DIMENSIONS } from './judge.mjs'
import { chat } from './run-round.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const evalDir = join(here, '..', '..', 'artifacts', 'digest-eval')
/** The calibrated judge. Try another with DIGEST_JUDGE_MODEL=<openrouter id>; results are written per model. */
const EFFORT = process.env.DIGEST_JUDGE_EFFORT
export const JUDGE = {
  key: 'judge',
  model: process.env.DIGEST_JUDGE_MODEL || 'google/gemini-3.8-flash',
  // A reasoning judge (DIGEST_JUDGE_EFFORT=high|max) thinks before answering, so it needs a bigger output budget.
  ...(EFFORT ? { reasoning: { effort: EFFORT }, maxTokens: 16000 } : { temperature: 0, maxTokens: 3000 }),
}
/** File suffix for a non-default judge's results, so a trial never overwrites the calibrated judge's. */
export const JUDGE_SUFFIX =
  process.env.DIGEST_JUDGE_MODEL || EFFORT
    ? `-${JUDGE.model.replace(/[^a-z0-9.]+/gi, '_')}${EFFORT ? `-${EFFORT.replace(/[^a-z]+/gi, '')}` : ''}`
    : ''

const lists = JSON.parse(readFileSync(join(here, 'bills.json'), 'utf8'))
const ids = [...lists.practice, ...lists.test].map((b) => b.id)
const picks = JSON.parse(readFileSync(join(evalDir, 'round1-picks.json'), 'utf8'))
const SOURCES = ['baseline_production', 'openai_gpt-6-luna', 'z-ai_glm-5.3-flash', 'deepseek_deepseek-v4.1-flash', 'meta_muse-spark-1.3-contributor']

const bill = (id) => JSON.parse(readFileSync(join(evalDir, 'bills', `${id}.json`), 'utf8'))
const summaryOf = (source, id) => {
  const r = JSON.parse(readFileSync(join(evalDir, 'out', source, `${id}.json`), 'utf8'))
  const s = r.summary
  if (!s) return null
  return { ...s, key_points: (s.key_points ?? []).map((k) => (typeof k === 'string' ? { text: k, section: null } : k)) }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }))
  return out
}

/** One planted error per kind, applied to a copy of a summary; null when the summary gives it nothing to change. */
const PLANTS = {
  supported: (s) => {
    const all = [s.what_it_does, ...s.key_points.map((k) => k.text)]
    const target = all.find((t) => /\d/.test(t ?? ''))
    if (!target) return null
    const changed = target.replace(/\d[\d,]*/, (n) => String(Number(n.replace(/,/g, '')) * 2 + 1))
    const c = structuredClone(s)
    if (c.what_it_does === target) c.what_it_does = changed
    else c.key_points = c.key_points.map((k) => (k.text === target ? { ...k, text: changed } : k))
    return c
  },
  votes: (s, b) => {
    const last = b.votes?.at(-1)
    const c = structuredClone(s)
    const claim = last ? `${last.result === 'Passed' ? 'Failed' : 'Passed'} in the ${last.chamber}.` : b.status.stage === 'law' ? 'Has not yet had a floor vote.' : 'Signed into law by the President.'
    c.key_points = [...c.key_points, { text: claim, section: null }]
    return c
  },
  strength: (s) => {
    // "could not"/"may not" are bans, not softer verbs; strengthening them would not change the meaning.
    const weaker = /\b(would (?:have [^.]*? )?consider|may(?! not)|could(?! not)|would allow|would study|authorizes?|would authorize)\b/i
    const all = [s.headline, s.what_it_does, ...s.key_points.map((k) => k.text)]
    const target = all.find((t) => weaker.test(t ?? ''))
    if (!target) return null
    const changed = target.replace(weaker, (w) => (/authoriz/i.test(w) ? 'fully funds' : 'requires'))
    const c = structuredClone(s)
    if (c.headline === target) c.headline = changed
    else if (c.what_it_does === target) c.what_it_does = changed
    else c.key_points = c.key_points.map((k) => (k.text === target ? { ...k, text: changed } : k))
    return c
  },
  neutral: (s) => ({ ...structuredClone(s), headline: `Sweeping, long-overdue ${s.headline.charAt(0).toLowerCase()}${s.headline.slice(1)}` }),
  dates: (s) => {
    const all = [s.what_it_does, ...s.key_points.map((k) => k.text)]
    const target = all.find((t) => /\b(19|20)\d{2}\b/.test(t ?? '') && /(January|February|March|April|May|June|July|August|September|October|November|December)/.test(t ?? ''))
    if (!target) return null
    const changed = target.replace(/,?\s*\b(19|20)\d{2}\b/, '')
    const c = structuredClone(s)
    if (c.what_it_does === target) c.what_it_does = changed
    else c.key_points = c.key_points.map((k) => (k.text === target ? { ...k, text: changed } : k))
    return c
  },
}

async function judge(b, s) {
  try {
    const r = await chat(JUDGE, judgeMessages(b, s), JUDGE.maxTokens)
    return { verdict: r.json, cost: r.cost }
  } catch (err) {
    return { verdict: null, error: err.message, cost: 0 }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = join(evalDir, 'judge')
  mkdirSync(outDir, { recursive: true })

  const plantedOnly = process.argv.includes('--planted-only')
  // 1. Agreement on round 1 (skipped with --planted-only, which re-tests sensitivity alone).
  const items = plantedOnly ? [] : ids.flatMap((id) => SOURCES.map((source) => ({ id, source })))
  const verdicts = await mapLimit(items, 6, async ({ id, source }) => {
    const s = summaryOf(source, id)
    return s ? { id, source, ...(await judge(bill(id), s)) } : { id, source, verdict: null, error: 'no summary', cost: 0 }
  })

  // 2. Sensitivity: plant errors in each human "best".
  const planted = []
  for (const id of ids) {
    const best = picks[id]?.best
    if (!best) continue
    const b = bill(id)
    const s = summaryOf(best, id)
    for (const [dimension, plant] of Object.entries(PLANTS)) {
      const bad = plant(s, b)
      if (bad) planted.push({ id, source: best, dimension, summary: bad })
    }
  }
  const plantedVerdicts = await mapLimit(planted, 6, async (p) => ({ ...p, ...(await judge(bill(p.id), p.summary)) }))

  const cost = [...verdicts, ...plantedVerdicts].reduce((n, v) => n + (v.cost || 0), 0)
  const bestPass = verdicts.filter((v) => picks[v.id]?.best === v.source)
  const marked = verdicts.filter((v) => picks[v.id]?.errors?.includes(v.source))
  const report = {
    judge: JUDGE.model,
    cost,
    agreement: {
      human_best_passed: `${bestPass.filter((v) => judgePassed(v.verdict)).length}/${bestPass.length}`,
      human_marked_error_failed: `${marked.filter((v) => v.verdict && !judgePassed(v.verdict)).length}/${marked.length}`,
      pass_rate_by_source: Object.fromEntries(SOURCES.map((src) => {
        const vs = verdicts.filter((v) => v.source === src && v.verdict)
        return [src, `${vs.filter((v) => judgePassed(v.verdict)).length}/${vs.length}`]
      })),
    },
    sensitivity: Object.fromEntries(Object.keys(PLANTS).map((d) => {
      const vs = plantedVerdicts.filter((p) => p.dimension === d && p.verdict)
      return [d, `${vs.filter((p) => p.verdict[d] === 'fail').length}/${vs.length} caught on "${d}"`]
    })),
    dimensions: JUDGE_DIMENSIONS,
    verdicts,
    planted: plantedVerdicts.map(({ summary, ...rest }) => rest),
  }
  writeFileSync(join(outDir, `${plantedOnly ? 'sensitivity' : 'calibration'}${JUDGE_SUFFIX}.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ judge: report.judge, cost: `$${cost.toFixed(3)}`, agreement: report.agreement, sensitivity: report.sensitivity }, null, 2))
}

#!/usr/bin/env node
/**
 * Build pairwise judge rounds for remote.mjs (the worker's JudgeSpec), and score them.
 *
 *   node scripts/digest-eval/judge-pairs.mjs calibrate <ratings.json> <write-request-id> <judge.json> <out.json>
 *       Dylan's favorite on each bill against every other summary he saw beside it, in both orders.
 *   node scripts/digest-eval/judge-pairs.mjs tournament <round.json> <write-request-id> <judge.json> <out.json> [--crs]
 *       Every pair of the round's candidates on each bill and run (plus CRS with --crs), in both orders.
 *   node scripts/digest-eval/judge-pairs.mjs score-calibration <ratings.json> <verdicts.json>
 *   node scripts/digest-eval/judge-pairs.mjs score <verdicts.json>
 *
 * calibrate and tournament take --rubric v1|v2 (eval/judge.ts; v1 by default).
 * <judge.json> is an EvalCandidate: { key, model, price: {input, output}, maxTokens?, reasoning?, temperature? }.
 * Verdicts come from `remote.mjs fetch <judge-request-id>` (artifacts/digest-eval/judge/<round>/<judge>.json).
 *
 * Each pair is judged twice with A and B swapped. A pair counts as a win only when both orders agree; when they
 * disagree (the judge followed position, not content) it counts as a tie. Rankings are Bradley–Terry strengths
 * over those results, with 95% intervals from resampling bills (2,000 bootstrap draws), so a ranking that one
 * bill decides shows up as a wide interval.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [cmd, ...args] = process.argv.slice(2)
const read = (f) => JSON.parse(readFileSync(f, 'utf8'))
const refOf = (request, bill, src, run = 1) => (src === 'crs' ? { crs: true } : { request, item: `${bill}|${src}|${run}` })
const keyOf = (...parts) => parts.join('~')

function bothOrders(bill, x, y, request, run, tag) {
  return [
    { key: keyOf(tag, bill, run, x, y), bill, run, a_src: x, b_src: y, a: refOf(request, bill, x, run), b: refOf(request, bill, y, run) },
    { key: keyOf(tag, bill, run, y, x), bill, run, a_src: y, b_src: x, a: refOf(request, bill, y, run), b: refOf(request, bill, x, run) },
  ]
}

const rubricFlag = (() => {
  const i = args.indexOf('--rubric')
  return i >= 0 ? args.splice(i, 2)[1] : undefined
})()

function writeSpec(round, judge, pairs, out) {
  const rubric = rubricFlag ?? 'v1'
  writeFileSync(out, JSON.stringify({ kind: 'judge', round: rubric === 'v1' ? round : `${round}-${rubric}`, rubric, judge, pairs }, null, 2))
  console.log(`wrote ${out}: ${pairs.length} judge calls`)
}

/** One result per unordered pair: which source won when both orders agree, else a tie. */
function settle(verdicts) {
  const by = new Map()
  for (const v of verdicts) {
    if (v.state !== 'ok' || !v.verdict) continue
    const [x, y] = [v.a_src, v.b_src].sort()
    const id = `${v.bill}|${v.run ?? 1}|${x}|${y}`
    const winner = v.verdict.winner === 'tie' ? 'tie' : v.verdict.winner === 'A' ? v.a_src : v.b_src
    if (!by.has(id)) by.set(id, { bill: v.bill, x, y, calls: [] })
    by.get(id).calls.push(winner)
  }
  const results = []
  let flips = 0
  let both = 0
  for (const r of by.values()) {
    if (r.calls.length === 2) {
      both += 1
      if (r.calls[0] !== r.calls[1]) flips += 1
    }
    const agreed = r.calls.every((c) => c === r.calls[0]) ? r.calls[0] : 'tie'
    results.push({ bill: r.bill, x: r.x, y: r.y, winner: agreed })
  }
  return { results, flips, both }
}

/** Bradley–Terry strengths (MM algorithm, a tie is half a win each, a small prior keeps unbeaten players finite). */
function bradleyTerry(results) {
  const players = [...new Set(results.flatMap((r) => [r.x, r.y]))]
  const wins = Object.fromEntries(players.map((p) => [p, 0.5]))
  const games = new Map()
  const g = (a, b) => `${a}|${b}`
  for (const r of results) {
    games.set(g(r.x, r.y), (games.get(g(r.x, r.y)) ?? 0) + 1)
    games.set(g(r.y, r.x), (games.get(g(r.y, r.x)) ?? 0) + 1)
    if (r.winner === 'tie') {
      wins[r.x] += 0.5
      wins[r.y] += 0.5
    } else wins[r.winner] += 1
  }
  let s = Object.fromEntries(players.map((p) => [p, 1]))
  for (let it = 0; it < 500; it += 1) {
    const next = {}
    for (const p of players) {
      let denom = 1 / (s[p] + 1) // prior: one game against a strength-1 player
      for (const q of players) if (q !== p && games.get(g(p, q))) denom += games.get(g(p, q)) / (s[p] + s[q])
      next[p] = wins[p] / denom
    }
    const mean = players.reduce((n, p) => n + Math.log(next[p]), 0) / players.length
    for (const p of players) next[p] = Math.exp(Math.log(next[p]) - mean)
    s = next
  }
  return s
}

function rankTable(results) {
  const strengths = bradleyTerry(results)
  const bills = [...new Set(results.map((r) => r.bill))]
  const draws = Object.fromEntries(Object.keys(strengths).map((p) => [p, []]))
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  for (let i = 0; i < 2000; i += 1) {
    const pick = bills.map(() => bills[Math.floor(rand() * bills.length)])
    const sample = pick.flatMap((b) => results.filter((r) => r.bill === b))
    const st = bradleyTerry(sample)
    for (const p of Object.keys(draws)) if (st[p] !== undefined) draws[p].push(Math.log(st[p]))
  }
  const q = (xs, f) => xs.slice().sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))]
  const rows = Object.entries(strengths)
    .sort((a, b) => b[1] - a[1])
    .map(([p, v]) => {
      const mine = results.filter((r) => r.x === p || r.y === p)
      const won = mine.filter((r) => r.winner === p).length
      const tied = mine.filter((r) => r.winner === 'tie').length
      return {
        candidate: p,
        strength: +Math.log(v).toFixed(2),
        ci95: `${q(draws[p], 0.025).toFixed(2)} … ${q(draws[p], 0.975).toFixed(2)}`,
        record: `${won}-${mine.length - won - tied}-${tied}`,
      }
    })
  return rows
}

if (cmd === 'calibrate') {
  const [ratingsFile, request, judgeFile, out] = args
  const ratings = read(ratingsFile).answers
  const pairs = []
  for (const [bill, a] of Object.entries(ratings)) {
    if (!a.favorite || !a.letters) continue
    for (const other of Object.values(a.letters)) if (other !== a.favorite) pairs.push(...bothOrders(bill, a.favorite, other, request, 1, 'cal'))
  }
  writeSpec(`calibration-${request.split('-').slice(0, 1)}`, read(judgeFile), pairs, out)
} else if (cmd === 'tournament') {
  const [roundFile, request, judgeFile, out, flag] = args
  const spec = read(roundFile)
  const srcs = spec.candidates.map((c) => c.key).concat(flag === '--crs' ? ['crs'] : [])
  const pairs = []
  for (const bill of spec.bills)
    for (let run = 1; run <= (spec.runs ?? 1); run += 1)
      for (let i = 0; i < srcs.length; i += 1)
        for (let j = i + 1; j < srcs.length; j += 1) {
          // CRS is the same text every run: compare it on run 1 only.
          if ((srcs[i] === 'crs' || srcs[j] === 'crs') && run > 1) continue
          pairs.push(...bothOrders(bill, srcs[i], srcs[j], request, run, 't'))
        }
  writeSpec(`${spec.round}-judged`, read(judgeFile), pairs, out)
} else if (cmd === 'score-calibration') {
  const [ratingsFile, verdictsFile] = args
  const ratings = read(ratingsFile).answers
  const { verdicts } = read(verdictsFile)
  const { results, flips, both } = settle(verdicts)
  let agree = 0
  let disagree = 0
  let tie = 0
  const perBill = {}
  for (const r of results) {
    const fav = ratings[r.bill].favorite
    const ok = r.winner === fav
    if (r.winner === 'tie') tie += 1
    else if (ok) agree += 1
    else disagree += 1
    ;(perBill[r.bill] ??= []).push(`${fav} vs ${r.x === fav ? r.y : r.x}: ${r.winner === 'tie' ? 'tie' : ok ? 'agrees' : 'disagrees'}`)
  }
  // Would the judge have picked Dylan's favorite out of the same lineup? (Most pairwise wins among those shown.)
  let topMatch = 0
  for (const [bill, a] of Object.entries(ratings)) {
    if (!a.favorite) continue
    const shown = Object.values(a.letters)
    const score = Object.fromEntries(shown.map((s) => [s, 0]))
    for (const v of verdicts.filter((x) => x.bill === bill && x.state === 'ok' && x.verdict)) {
      const w = v.verdict.winner === 'tie' ? null : v.verdict.winner === 'A' ? v.a_src : v.b_src
      if (w) score[w] += 1
    }
    const best = Math.max(...Object.values(score))
    if (score[a.favorite] === best) topMatch += 1
  }
  const failed = verdicts.filter((v) => v.state !== 'ok').length
  console.log(`pairs: ${results.length}; judge agrees with Dylan on ${agree}, disagrees on ${disagree}, ties ${tie}`)
  console.log(`decided pairs agreeing: ${agree + disagree ? Math.round((100 * agree) / (agree + disagree)) : 0}% (chance is 50%)`)
  console.log(`position flips (the two orders disagreed): ${flips} of ${both}; calls without a verdict: ${failed}`)
  console.log(`Dylan's favorite has the judge's most wins (ties count) on ${topMatch} of ${Object.keys(ratings).length} bills`)
  console.log(JSON.stringify(perBill, null, 1))
} else if (cmd === 'score-rankings') {
  // Rating-page rankings → pairwise results (each ranking of n gives n(n-1)/2), ranked overall, by model and by prompt.
  const results = []
  for (const f of args) {
    for (const [bill, a] of Object.entries(read(f).answers)) {
      const r = a.ranking ?? []
      for (let i = 0; i < r.length; i += 1) for (let j = i + 1; j < r.length; j += 1) {
        const [x, y] = [r[i], r[j]].sort()
        results.push({ bill: `${f}|${bill}`, x, y, winner: r[i] })
      }
    }
  }
  const group = (fn) => results.map((r) => ({ ...r, x: fn(r.x), y: fn(r.y), winner: fn(r.winner) })).filter((r) => r.x !== r.y)
  const model = (k) => k.replace(/-(v34|v4|v4-plan|v4-facts)$/, '')
  const prompt = (k) => (/-(v34|v4|v4-plan|v4-facts)$/.exec(k) ?? [, k])[1]
  console.log(`${results.length} pairwise results from ${args.length} rater file(s)`)
  console.log('by contender:'); console.table(rankTable(results))
  console.log('by model (prompts pooled):'); console.table(rankTable(group(model)))
  console.log('by prompt (models pooled):'); console.table(rankTable(group(prompt)))
} else if (cmd === 'score') {
  const { verdicts } = read(args[0])
  const { results, flips, both } = settle(verdicts)
  console.log(`${results.length} pairs; position flips ${flips} of ${both}; calls without a verdict: ${verdicts.filter((v) => v.state !== 'ok').length}`)
  console.table(rankTable(results))
} else {
  console.error('usage: judge-pairs.mjs calibrate|tournament|score-calibration|score ... (see the header of this file)')
  process.exit(2)
}

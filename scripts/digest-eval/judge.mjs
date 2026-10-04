/**
 * Judge model for digest evals. One call per summary asks narrow pass/fail questions (each may be "unknown"),
 * never a holistic score: pass/fail per dimension is more reliable than 1–10 ratings, and "unknown" keeps the
 * judge from guessing. The judge sees the same sources the summarizer saw; for long bills it sees the CRS summary
 * and the text of the sections each point cites, never the whole bill.
 *
 * A judge is only trusted after calibration (agreement with the human picks) and a sensitivity test (it must fail
 * summaries with planted errors). See calibrate-judge.mjs.
 */
import { citedSections, sectionText } from './checks.mjs'

const JUDGE_SYSTEM = `You check plain-language summaries of U.S. bills for accuracy and fairness. You compare the summary against the SOURCES only. You are strict about facts and neutral about politics. You return only JSON.`

// Same facts the summarizer was given, including whether a vote needed two-thirds; a judge that sees less than
// the summarizer flags correct statements as unsupported.
const TWO_THIRDS = (question, bill) =>
  /suspend the rules|overrid/i.test(question ?? '') ||
  (/^(HJRES|SJRES)$/.test(bill.type) && /^\s*proposing an amendment to the constitution/i.test(bill.title ?? ''))

function votesText(bill) {
  if (!bill.votes?.length) return 'none recorded'
  return bill.votes
    .map((v) => `${v.chamber}, ${v.vote_date}: ${v.question} — ${v.result} ${v.yeas}–${v.nays}${TWO_THIRDS(v.question, bill) ? ' (needed two-thirds of those voting)' : ''}`)
    .join('\n')
}

/** The source material the judge may rely on, kept to what the summary cites for very long bills. */
export function judgeSources(bill, summary) {
  const crs = bill.crs ? `CRS SUMMARY:\n${bill.crs.text}` : 'CRS SUMMARY: not published'
  if (!bill.parts?.length) {
    return `${crs}\n\nBILL TEXT (${bill.textVersion?.type ?? 'none'}):\n${bill.text ?? 'not yet published — only the title is available'}`
  }
  // Each key point gets its own share of the space, so a summary that cites many long sections cannot push the
  // last point's sections past the limit (which would make a correct figure look unsupported).
  const points = summary.key_points ?? []
  const perPoint = Math.floor(120_000 / Math.max(1, points.length))
  const blocks = points.map((k, i) => {
    const text = sectionText(bill, citedSections(k.section)) ?? '(no matching section found)'
    return `-- For key point ${i + 1} (${k.section ?? 'no section cited'}):\n${text.slice(0, perPoint)}`
  })
  return `${crs}\n\nCITED SECTIONS OF THE BILL TEXT (the bill is ${bill.tokens.toLocaleString()} tokens long; only the sections each key point cites are shown):\n${blocks.join('\n\n')}`
}

export function judgeMessages(bill, summary) {
  const shown = {
    headline: summary.headline,
    what_it_does: summary.what_it_does,
    who_it_affects: summary.who_it_affects ?? [],
    key_points: (summary.key_points ?? []).map((k) => (typeof k === 'string' ? { text: k, section: null } : k)),
  }
  return [
    { role: 'system', content: JUDGE_SYSTEM },
    {
      role: 'user',
      content: `BILL: ${bill.type} ${bill.number} — ${bill.title}
STATUS: ${bill.status.label}${bill.status.stage === 'law' ? ' (law)' : ' (not law)'}
VOTES:
${votesText(bill)}

SOURCES
${judgeSources(bill, summary)}

SUMMARY TO CHECK (JSON):
${JSON.stringify(shown, null, 1)}

Answer each question with "pass", "fail", or "unknown" (use "unknown" only when the sources shown cannot settle it).
1. supported: every factual claim (numbers, dates, who, what changes) is stated in or directly follows from the SOURCES. A plain definition of a term or program from common knowledge ("harbor craft, such as tugboats") is allowed; added numbers, effects, history, or motives are not. Groups in who_it_affects are plain-language descriptions of whoever the bill's changes apply to ("truck and bus fleet owners" for grants to replace diesel engines); fail one unless the sources name it or it is the direct subject of a provision (the people or businesses the bill requires, bans, pays, protects, or covers); the agency that carries the bill out, and groups that might feel an effect only indirectly (voters, taxpayers), fail. List each claim that is not supported.
2. strength: the summary keeps the bill's strength of language. Fail if it says "requires/must/will" where the text says "consider/may/study", or "funds/provides $X" where the text only authorizes.
3. votes: nothing contradicts the STATUS or VOTES (for example calling a bill "introduced" after a floor vote, or omitting that a vote failed when the summary describes its progress).
4. neutral: no judging words, no taking sides, no characterizing motives.
5. complete: the headline and key points include the change in the SOURCES that matters most to ordinary people, and, when the measure overturns or responds to someone's action (a state's rule, an agency decision), who and what that is. Name what is missing, if anything.
6. dates: every date a reader needs is unambiguous (a recurring deadline says it recurs; a one-time date has its year).

Return ONLY:
{
  "supported": "pass" | "fail" | "unknown",
  "unsupported_claims": ["exact words from the summary that the sources do not support"],
  "strength": "pass" | "fail" | "unknown",
  "votes": "pass" | "fail" | "unknown",
  "neutral": "pass" | "fail" | "unknown",
  "complete": "pass" | "fail" | "unknown",
  "missing": "the most important missing change, or null",
  "dates": "pass" | "fail" | "unknown",
  "reason": "one sentence on the most serious problem, or null"
}`,
    },
  ]
}

export const JUDGE_DIMENSIONS = ['supported', 'strength', 'votes', 'neutral', 'complete', 'dates']

/** A summary passes the judge when no dimension fails. */
export function judgePassed(verdict) {
  return JUDGE_DIMENSIONS.every((d) => verdict?.[d] !== 'fail')
}

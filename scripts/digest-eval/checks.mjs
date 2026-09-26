/**
 * Automatic checks on one summary against its bill. Nothing here judges quality; it flags what a reader must
 * never see: numbers the sources do not contain, judging words, and length or shape the site cannot show.
 */

const JUDGING = ['landmark', 'sweeping', 'historic', 'controversial', 'common-sense', 'commonsense', 'radical', 'extreme', 'bold', 'crucial', 'critical', 'harmful', 'dangerous', 'devastating', 'unprecedented', 'massive', 'draconian', 'reckless', 'vital']

const SCALE = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 }
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 }

/** Every numeric value in a text: "$45,000,000,000", "$45 billion", "15 percent", "three years", "2028". */
export function numbersIn(text) {
  const values = new Set()
  const s = String(text ?? '')
  for (const m of s.matchAll(/\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion)?/gi)) {
    const n = Number(m[1].replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    values.add(m[2] ? Math.round(n * SCALE[m[2].toLowerCase()]) : n)
  }
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(s)) values.add(n)
  }
  return values
}

/** Section and law citations ("Sec. 70101", "title 31") are not facts to check. */
function withoutCitations(text) {
  return String(text ?? '')
    .replace(/\b(Secs?\.|Sections?|Title|Subtitle|Division|U\.S\.C\.|Public Law|P\.L\.)\s*[\dIVXLC]+[\w.–-]*/gi, ' ')
    .replace(/\b(H\.\s?R\.|S\.|H\.\s?Res\.|H\.\s?J\.\s?Res\.|H\.\s?Con\.\s?Res\.)\s*\d+/gi, ' ')
}

export function sourceNumbers(bill) {
  const parts = (bill.parts ?? []).map((p) => p.text).join('\n')
  return numbersIn([bill.title, bill.crs?.text, bill.text, parts, bill.introducedDate, bill.status?.label].join('\n'))
}

const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return 1
  return Math.max(1, w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)?.length ?? 1)
}

/** Flesch-Kincaid grade of the reader-facing text. */
export function gradeLevel(text) {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length)
  const ws = text.split(/\s+/).filter((w) => /[a-z]/i.test(w))
  if (ws.length === 0) return 0
  const syl = ws.reduce((n, w) => n + syllables(w), 0)
  return Math.round((0.39 * (ws.length / sentences) + 11.8 * (syl / ws.length) - 15.59) * 10) / 10
}

export function readerText(summary) {
  const points = (summary.key_points ?? []).map((k) => (typeof k === 'string' ? k : k.text))
  const inside = (summary.inside ?? []).map((r) => r.summary)
  return [summary.headline, summary.what_it_does, ...points, ...inside].filter(Boolean)
}

/** "Sec. 2", "Secs. 70101, 70104", "Secs. 71119–71120" → section numbers (ranges expanded when short). */
export function citedSections(section) {
  const out = []
  for (const m of String(section ?? '').matchAll(/(\d+[A-Z]?)(?:\s*[–-]\s*(\d+))?/g)) {
    const a = Number.parseInt(m[1], 10)
    const b = m[2] ? Number.parseInt(m[2], 10) : null
    if (b && b > a && b - a <= 30) for (let n = a; n <= b; n += 1) out.push(String(n))
    else out.push(m[1])
  }
  return out
}

/**
 * Text of the given sections: from "SEC. n." to the next section in sequence. Bills that amend other laws
 * quote whole new sections ("SEC. 117A.") inside their own; those headings do not end the cited section.
 */
export function sectionText(bill, sections) {
  const full = `\n${[bill.text, ...(bill.parts ?? []).map((p) => p.text)].join('\n')}`
  const found = []
  for (const n of sections) {
    const start = full.search(new RegExp(`\\nSEC\\. ${n}\\.?\\s`))
    if (start < 0) continue
    const num = Number.parseInt(n, 10)
    const after = full.slice(start + 1)
    let end = after.length
    for (const m of after.matchAll(/\nSEC\. (\d+)\.?\s/g)) {
      const next = Number.parseInt(m[1], 10)
      if (next > num && next <= num + 5) {
        end = m.index
        break
      }
    }
    found.push(after.slice(0, end))
  }
  return found.length ? found.join('\n') : null
}

export function checkSummary(summary, bill, { long = false } = {}) {
  const flags = []
  if (!summary || typeof summary !== 'object') return { flags: ['no summary'], grade: null }
  const hw = words(summary.headline)
  if (hw < 5 || hw > 13) flags.push(`headline ${hw} words`)
  if (/^(this bill|new legislation|the bill)\b/i.test(summary.headline ?? '')) flags.push('headline starts generic')
  if (words(summary.what_it_does) > 28) flags.push(`what_it_does ${words(summary.what_it_does)} words`)
  const points = summary.key_points ?? []
  // Long bills, and rules for debate (one point per measure they set up), may use five.
  const maxPoints = long || /^HRES|^SRES/.test(bill.type ?? '') ? 5 : 4
  if (points.length < 1 || points.length > maxPoints) flags.push(`${points.length} key points`)
  for (const p of points) {
    const t = typeof p === 'string' ? p : p.text
    if (words(t) > 24) flags.push(`key point ${words(t)} words`)
  }
  if (Array.isArray(summary.who_it_affects) && summary.who_it_affects.length > 3) flags.push(`${summary.who_it_affects.length} groups affected`)

  const text = readerText(summary).join(' ')
  const lower = text.toLowerCase()
  // Fixed terms of art are not judgments ("critical minerals", "critical infrastructure", "critical access hospitals").
  const plain = lower.replace(/\bcritical[- ](minerals?|infrastructure|access|habitat|care)\b/g, '')
  for (const w of JUDGING) if (new RegExp(`\\b${w}\\b`).test(plain)) flags.push(`judging word "${w}"`)

  const known = sourceNumbers(bill)
  const crsNumbers = numbersIn([bill.title, bill.crs?.text].join('\n'))
  // Key points are checked against the sections they cite, which catches a wrong figure in a 500-page bill
  // even when the same number appears elsewhere in it. Uncited points, and everything else, use all sources.
  const pointTexts = []
  for (const p of points) {
    const t = typeof p === 'string' ? p : p.text
    const cited = typeof p === 'string' ? null : sectionText(bill, citedSections(p.section))
    if (!cited) {
      pointTexts.push(t)
      continue
    }
    const local = numbersIn(cited)
    for (const n of numbersIn(withoutCitations(t))) {
      if (!local.has(n) && !crsNumbers.has(n)) {
        if (n <= 12) {
          flags.push(`minor: small number ${n} not in cited section`)
          continue
        }
        flags.push(known.has(n) ? `number not in cited section (${p.section}): ${n.toLocaleString('en-US')}` : `number not in sources: ${n.toLocaleString('en-US')}`)
      }
    }
  }
  const rest = [summary.headline, summary.what_it_does, ...pointTexts, ...(summary.inside ?? []).map((r) => r.summary)].join(' ')
  const unknown = [...numbersIn(withoutCitations(rest))].filter((n) => !known.has(n))
  // Small counts ("two groups", "3 years") are often paraphrased from words, so they are minor; larger ones are not.
  for (const n of unknown) flags.push(n > 12 ? `number not in sources: ${n.toLocaleString('en-US')}` : `minor: small number ${n} not in sources`)

  return { flags, grade: gradeLevel(text) }
}

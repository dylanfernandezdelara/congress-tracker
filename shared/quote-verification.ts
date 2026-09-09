import type { BillDigestContent } from './digest-api-types'
import {
  BILL_QUOTE_MAX_CHARS,
  BILL_QUOTE_MIN_CHARS,
  type BillQuoteBill,
  type BillQuoteSource,
} from './share-api-types'

export type QuoteSourceText = {
  source: BillQuoteSource
  text: string
}

export type QuoteRange = { start: number; end: number }

/**
 * Single punctuation policy for quote matching. The verifier folds each class
 * to its ASCII member; the highlighter matches any member of the class. Keeping
 * both derived from these tables is what guarantees a quote the API accepted
 * is one the landing page can mark.
 */
const APOSTROPHE_CLASS = "'\u2018\u2019\u201A\u201B\u2032"
const DOUBLE_QUOTE_CLASS = '"\u201C\u201D\u201E\u201F\u2033'
const DASH_CLASS = '\\-\u2010-\u2015\u2212'

const APOSTROPHES_RE = new RegExp(`[${APOSTROPHE_CLASS}]`, 'g')
const DOUBLE_QUOTES_RE = new RegExp(`[${DOUBLE_QUOTE_CLASS}]`, 'g')
const DASHES_RE = new RegExp(`[${DASH_CLASS}]`, 'g')
const APOSTROPHE_CHAR_RE = new RegExp(`^[${APOSTROPHE_CLASS}]$`)
const DOUBLE_QUOTE_CHAR_RE = new RegExp(`^[${DOUBLE_QUOTE_CLASS}]$`)
const DASH_CHAR_RE = new RegExp(`^[${DASH_CLASS}]$`)
const ELLIPSIS_PATTERN = '(?:\\.\\.\\.|\u2026)'

/** Display form: trim + collapse whitespace, keep casing and punctuation. */
export function cleanQuoteText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Match form: case-folded, typographic quotes/dashes/ellipses unified, all
 * whitespace collapsed. Selections copied from rendered HTML and digest JSON
 * frequently differ only in these ways.
 */
export function normalizeForQuoteMatch(text: string): string {
  return text
    .replace(APOSTROPHES_RE, "'")
    .replace(DOUBLE_QUOTES_RE, '"')
    .replace(DASHES_RE, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export type QuoteLengthCheck = 'ok' | 'too_short' | 'too_long'

export function checkQuoteLength(cleaned: string): QuoteLengthCheck {
  if (cleaned.length < BILL_QUOTE_MIN_CHARS) return 'too_short'
  if (cleaned.length > BILL_QUOTE_MAX_CHARS) return 'too_long'
  return 'ok'
}

/**
 * First source whose normalized text contains the normalized quote.
 * Sources are checked in the order given so callers control precedence
 * (digest before CRS before full bill text).
 */
export function findQuoteSource<T extends QuoteSourceText>(quote: string, sources: T[]): T | null {
  const needle = normalizeForQuoteMatch(quote)
  if (!needle) return null
  for (const candidate of sources) {
    if (!candidate.text) continue
    if (normalizeForQuoteMatch(candidate.text).includes(needle)) return candidate
  }
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Regex that finds `quote` inside rendered text while tolerating the same
 * differences `normalizeForQuoteMatch` erases: casing, whitespace runs, curly
 * vs straight quotes, dash variants, and `...` vs `…`.
 */
export function buildQuoteMatcher(quote: string): RegExp | null {
  const cleaned = cleanQuoteText(quote)
  if (!cleaned) return null
  let pattern = ''
  let index = 0
  while (index < cleaned.length) {
    const char = cleaned[index]!
    if (cleaned.startsWith('...', index)) {
      pattern += ELLIPSIS_PATTERN
      index += 3
      continue
    }
    if (/\s/.test(char)) {
      pattern += '\\s+'
    } else if (APOSTROPHE_CHAR_RE.test(char)) {
      pattern += `[${APOSTROPHE_CLASS}]`
    } else if (DOUBLE_QUOTE_CHAR_RE.test(char)) {
      pattern += `[${DOUBLE_QUOTE_CLASS}]`
    } else if (DASH_CHAR_RE.test(char)) {
      pattern += `[${DASH_CLASS}]`
    } else if (char === '\u2026') {
      pattern += ELLIPSIS_PATTERN
    } else {
      pattern += escapeRegExp(char)
    }
    index += 1
  }
  try {
    return new RegExp(pattern, 'iu')
  } catch {
    return null
  }
}

/** First tolerant match of `quote` in `text`, as original-string offsets. */
export function findQuoteInText(text: string, quote: string): QuoteRange | null {
  const matcher = buildQuoteMatcher(quote)
  if (!matcher || !text) return null
  const match = matcher.exec(text)
  if (!match) return null
  return { start: match.index, end: match.index + match[0].length }
}

export function textContainsQuote(text: string | null | undefined, quote: string): boolean {
  return Boolean(text) && findQuoteInText(text!, quote) !== null
}

/**
 * Digest fields rendered inside `[data-quotable]` regions of the detail panel:
 * "What it does" and the key points. The headline and term glossary are shown
 * elsewhere (or not at all) and cannot be selected, so they are not sources.
 */
export function digestQuoteSourceText(digest: BillDigestContent | null | undefined): string {
  if (!digest) return ''
  const parts: unknown[] = [digest.what_it_does, ...(digest.key_points ?? [])]
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join('\n')
}

/** True when `quote` was stored for `bill` (type compared case-insensitively). */
export function quoteBelongsToBill(
  quote: { bill: BillQuoteBill },
  bill: { congress: number; type: string; number: number },
): boolean {
  return (
    quote.bill.congress === bill.congress &&
    quote.bill.type.toUpperCase() === bill.type.toUpperCase() &&
    quote.bill.number === bill.number
  )
}

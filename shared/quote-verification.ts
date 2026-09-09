import type { BillDigestContent } from './digest-api-types'
import {
  BILL_QUOTE_MAX_CHARS,
  BILL_QUOTE_MIN_CHARS,
  type BillQuoteSource,
} from './share-api-types'

export type QuoteSourceText = {
  source: BillQuoteSource
  text: string
}

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
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
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
export function findQuoteSource(
  quote: string,
  sources: QuoteSourceText[],
): BillQuoteSource | null {
  const needle = normalizeForQuoteMatch(quote)
  if (!needle) return null
  for (const candidate of sources) {
    if (!candidate.text) continue
    if (normalizeForQuoteMatch(candidate.text).includes(needle)) return candidate.source
  }
  return null
}

/** Digest fields a reader can see (and therefore select) in the detail panel. */
export function digestQuoteSourceText(digest: BillDigestContent | null | undefined): string {
  if (!digest) return ''
  const parts: string[] = [digest.headline, digest.what_it_does, ...(digest.key_points ?? [])]
  for (const term of digest.terms_explained ?? []) {
    parts.push(term.term, term.plain)
  }
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join('\n')
}

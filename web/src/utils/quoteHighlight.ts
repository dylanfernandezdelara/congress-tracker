import { cleanQuoteText } from '@congress-tracker/shared/quote-verification'

export type QuoteRange = { start: number; end: number }

const APOSTROPHES = "['\u2018\u2019\u201A\u201B\u2032]"
const DOUBLE_QUOTES = '["\u201C\u201D\u201E\u201F\u2033]'
const DASHES = '[-\u2010-\u2015\u2212]'
const ELLIPSIS = '(?:\\.\\.\\.|\u2026)'
const APOSTROPHE_RE = new RegExp(APOSTROPHES)
const DOUBLE_QUOTE_RE = new RegExp(DOUBLE_QUOTES)
const DASH_RE = new RegExp(DASHES)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Regex that finds `quote` inside rendered text while tolerating the ways a
 * selection differs from the source: casing, whitespace runs, curly vs straight
 * quotes, dash variants, and `...` vs `…`. Mirrors `normalizeForQuoteMatch` on
 * the worker so a quote the API accepted is also one we can highlight.
 */
export function buildQuoteMatcher(quote: string): RegExp | null {
  const cleaned = cleanQuoteText(quote)
  if (!cleaned) return null
  let pattern = ''
  let index = 0
  while (index < cleaned.length) {
    const char = cleaned[index]!
    if (cleaned.startsWith('...', index)) {
      pattern += ELLIPSIS
      index += 3
      continue
    }
    if (/\s/.test(char)) {
      pattern += '\\s+'
    } else if (APOSTROPHE_RE.test(char)) {
      pattern += APOSTROPHES
    } else if (DOUBLE_QUOTE_RE.test(char)) {
      pattern += DOUBLE_QUOTES
    } else if (DASH_RE.test(char)) {
      pattern += DASHES
    } else if (char === '\u2026') {
      pattern += ELLIPSIS
    } else if (char === '\u00A0') {
      pattern += '\\s+'
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

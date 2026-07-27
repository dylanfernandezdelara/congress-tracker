// Feed collapsed card: glanceable plain-English digest (matches OpenRouter prompt targets).
export const FEED_LEAD_MAX_WORDS = 25
export const FEED_BULLET_MAX_WORDS = 12
export const FEED_COLLAPSED_MAX_BULLETS = 4

// Ingest caps: generous safety bounds for pathological model output at storage time.
export const DIGEST_LEAD_MAX_WORDS = 60
export const DIGEST_BULLET_MAX_WORDS = 40
export const DIGEST_MAX_BULLETS = 8

export function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return `${words.slice(0, maxWords).join(' ')}…`
}

function protectAbbreviations(text: string): string {
  return text
    .replace(/\bU\.S\.C\./gi, 'U§S§C§')
    .replace(/\bU\.S\./gi, 'U§S§')
    .replace(/\bU\.K\./gi, 'U§K§')
    .replace(/\bSec\.\s+\d+/gi, (match) => match.replace(/\./g, '§'))
    .replace(/\bNo\.\s+\d+/gi, (match) => match.replace(/\./g, '§'))
    .replace(/\bH\.R\.\s*\d+/gi, (match) => match.replace(/\./g, '§'))
    .replace(/\bS\.\s*\d+/gi, (match) => match.replace(/\./g, '§'))
    .replace(/\$(\d+)\.(\d+)/g, (_, whole, fraction) => `$${whole}§${fraction}`)
}

function restoreAbbreviations(text: string): string {
  return text.replace(/§/g, '.')
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function firstSentence(text: string): string {
  const collapsed = collapseWhitespace(text)
  if (!collapsed) return collapsed

  const protectedText = protectAbbreviations(collapsed)
  const boundary = protectedText.search(/[.!?](?:\s|$)/)
  if (boundary === -1) return collapsed

  const first = protectedText.slice(0, boundary + 1).trim()
  return restoreAbbreviations(first)
}

export function normalizeDigestLead(
  text: string,
  maxWords: number = DIGEST_LEAD_MAX_WORDS,
): string {
  return truncateWords(firstSentence(text), maxWords)
}

/** Collapsed feed card: one short sentence capped at FEED_LEAD_MAX_WORDS. */
export function formatCollapsedDigestLead(text: string): string {
  return truncateWords(firstSentence(text.trim()), FEED_LEAD_MAX_WORDS)
}

export function normalizeDigestBullets(
  points: string[],
  options: { maxWords?: number; maxBullets?: number } = {},
): string[] {
  const { maxWords = DIGEST_BULLET_MAX_WORDS, maxBullets = DIGEST_MAX_BULLETS } = options
  return points
    .map((point) => truncateWords(point.trim(), maxWords))
    .filter((point) => point.length > 0)
    .slice(0, maxBullets)
}

export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const slice = text.slice(0, maxLength)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace <= 0) return `${slice.trimEnd()}…`
  return `${slice.slice(0, lastSpace).trimEnd()}…`
}

/**
 * Truncate at a sentence boundary when one exists in the second half of the
 * window. Abbreviations like "U.S." / "H.R." are protected so they are not
 * mistaken for sentence ends. Falls back to a word-boundary ellipsis cut.
 */
export function truncateAtSentenceBoundary(text: string, maxLength: number): string {
  const collapsed = collapseWhitespace(text)
  if (collapsed.length <= maxLength) return collapsed

  const window = collapsed.slice(0, maxLength)
  const protectedWindow = protectAbbreviations(window)
  const markers = ['. ', '! ', '? ']
  const sentenceAt = Math.max(...markers.map((marker) => protectedWindow.lastIndexOf(marker)))
  const minSentenceChars = Math.floor(maxLength * 0.5)

  if (sentenceAt >= minSentenceChars) {
    return restoreAbbreviations(protectedWindow.slice(0, sentenceAt + 1).trimEnd())
  }

  return truncateAtWordBoundary(collapsed, maxLength)
}

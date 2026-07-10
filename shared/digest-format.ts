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

/** Collapsed feed card: capped bullets for glanceable mobile layout. */
export function formatCollapsedDigestBullets(points: string[]): string[] {
  return normalizeDigestBullets(points, {
    maxWords: FEED_BULLET_MAX_WORDS,
    maxBullets: FEED_COLLAPSED_MAX_BULLETS,
  })
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

export interface FeedSummaryParts {
  lead: string
  bullets: string[]
}

export function buildFeedSummaryParts(input: {
  whatItDoes: string | null | undefined
  keyPoints: string[] | null | undefined
}): FeedSummaryParts | null {
  const whatItDoes = input.whatItDoes?.trim()

  if (whatItDoes) {
    return {
      lead: formatCollapsedDigestLead(whatItDoes),
      bullets: formatCollapsedDigestBullets(input.keyPoints ?? []),
    }
  }

  // No OpenRouter digest yet — do not dump raw CRS on the collapsed card.
  const firstKeyPoint = input.keyPoints?.find((point) => point.trim().length > 0)
  if (firstKeyPoint) {
    return {
      lead: formatCollapsedDigestLead(firstKeyPoint),
      bullets: [],
    }
  }

  return null
}

export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const slice = text.slice(0, maxLength)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace <= 0) return `${slice.trimEnd()}…`
  return `${slice.slice(0, lastSpace).trimEnd()}…`
}

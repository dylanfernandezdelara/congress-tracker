import type { BillDigestContent } from './game-api-types'

const BOILERPLATE_TITLE_SUFFIX = /,?\s+and for other purposes\.?$/i

const PROVIDING_FOR_CONSIDERATION_PATTERN =
  /^Providing for consideration of the (?:bill|joint resolution|resolution) \(?(H\.?\s?R\.?|H\. ?Res\.?|S\.|S\. ?Res\.?)\s?(\d+)\)?,? (?:to |which )?(.+)$/i

const RULE_WAIVER_PATTERN = /^Waiving a requirement of clause .+ of rule .+/i

const PROCEDURAL_VOTE_QUESTION_PATTERN =
  /cloture|motion to (recommit|table|proceed|discharge)|previous question|point of order|adjourn/i

const OUTCOME_LEAK_PATTERN =
  /\b(passed|failed|agreed to|rejected|defeated|not agreed)\b/i

const TYPE_LABELS: Record<string, string> = {
  HR: 'H.R.',
  S: 'S.',
  HRES: 'H.Res.',
  SRES: 'S.Res.',
  HCONRES: 'H.Con.Res.',
  SCONRES: 'S.Con.Res.',
  HJRES: 'H.J.Res.',
  SJRES: 'S.J.Res.',
}

const GAME_SNIPPET_MAX_CHARS = 180

export const DIGEST_LEAD_MAX_WORDS = 25
export const DIGEST_BULLET_MAX_WORDS = 12
export const DIGEST_MAX_BULLETS = 4
export const FEED_COLLAPSED_MAX_BULLETS = 3

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

export function firstSentence(text: string): string {
  const collapsed = collapseWhitespace(text)
  if (!collapsed) return collapsed

  const protectedText = protectAbbreviations(collapsed)
  const boundary = protectedText.search(/[.!?](?:\s|$)/)
  if (boundary === -1) return collapsed

  const first = protectedText.slice(0, boundary + 1).trim()
  return restoreAbbreviations(first)
}

export function normalizeDigestLead(text: string): string {
  return truncateWords(firstSentence(text), DIGEST_LEAD_MAX_WORDS)
}

export function normalizeDigestBullets(points: string[]): string[] {
  return points
    .map((point) => truncateWords(point.trim(), DIGEST_BULLET_MAX_WORDS))
    .filter((point) => point.length > 0)
    .slice(0, DIGEST_MAX_BULLETS)
}

export interface FeedSummaryParts {
  lead: string
  bullets: string[]
}

export function buildFeedSummaryParts(input: {
  whatItDoes: string | null | undefined
  keyPoints: string[] | null | undefined
  rawSummaryText: string | null | undefined
  collapsedMaxBullets?: number
}): FeedSummaryParts | null {
  const maxBullets = input.collapsedMaxBullets ?? FEED_COLLAPSED_MAX_BULLETS
  const whatItDoes = input.whatItDoes?.trim()

  if (whatItDoes) {
    return {
      lead: normalizeDigestLead(whatItDoes),
      bullets: normalizeDigestBullets(input.keyPoints ?? []).slice(0, maxBullets),
    }
  }

  const rawSummary = input.rawSummaryText?.trim()
  if (rawSummary) {
    const body = summaryBodyText(rawSummary)
    if (body) {
      return {
        lead: truncateAtWordBoundary(collapseWhitespace(body), 120),
        bullets: [],
      }
    }
  }

  const firstKeyPoint = input.keyPoints?.find((point) => point.trim().length > 0)
  if (firstKeyPoint) {
    return {
      lead: normalizeDigestLead(firstKeyPoint),
      bullets: [],
    }
  }

  return null
}

export function formatShortBillId(type: string, number: number): string {
  const label = TYPE_LABELS[type.toUpperCase()] ?? type
  return `${label} ${number}`
}

export function formatBillDocket(type: string, number: number, congress: number): string {
  return `${formatShortBillId(type, number)} · ${congress}th Congress`
}

export function trimDisplayTitle(title: string): string {
  return title.replace(BOILERPLATE_TITLE_SUFFIX, '').trim()
}

export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const slice = text.slice(0, maxLength)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace <= 0) return `${slice.trimEnd()}…`
  return `${slice.slice(0, lastSpace).trimEnd()}…`
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function summaryBodyText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed

  const newlineIndex = trimmed.indexOf('\n')
  if (newlineIndex === -1) return collapseWhitespace(trimmed)

  const firstLine = trimmed.slice(0, newlineIndex).trim()
  const remainder = trimmed.slice(newlineIndex + 1).trim()
  const endsWithSentencePunctuation = /[.!?]$/.test(firstLine)

  if (!endsWithSentencePunctuation && remainder.length > 0) {
    return collapseWhitespace(remainder)
  }

  return collapseWhitespace(trimmed)
}

export function proceduralHeadline(title: string): string | null {
  if (RULE_WAIVER_PATTERN.test(title)) {
    return 'Fast-tracks floor consideration (rule waiver)'
  }

  const match = title.match(PROVIDING_FOR_CONSIDERATION_PATTERN)
  if (!match) return null

  const [, billType, billNumber, subjectRaw] = match
  const billId = normalizeBillRef(billType, billNumber)
  const subject = truncateAtWordBoundary(capitalizeFirst(trimDisplayTitle(subjectRaw.trim())), 80)

  return `Sets up House debate on ${billId}: ${subject}`
}

function normalizeBillRef(typeRaw: string, number: string): string {
  const compact = typeRaw.replace(/\s+/g, '').toUpperCase()
  if (compact === 'HR' || compact === 'H.R') return `H.R. ${number}`
  if (compact.startsWith('H') && compact.includes('RES')) return `H.Res. ${number}`
  if (compact === 'S' || compact === 'S.') return `S. ${number}`
  if (compact.startsWith('S') && compact.includes('RES')) return `S.Res. ${number}`
  return `${typeRaw.trim()} ${number}`
}

function capitalizeFirst(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function normalizeVoteResult(result: string): string {
  return result.toLowerCase()
}

function voteResultIndicatesFailure(normalized: string): boolean {
  return (
    normalized.includes('fail') ||
    normalized.includes('reject') ||
    normalized.includes('defeat') ||
    normalized.includes('disagreed') ||
    normalized.includes('not agreed')
  )
}

function voteResultIndicatesPassage(normalized: string): boolean {
  if (voteResultIndicatesFailure(normalized)) return false
  return normalized.includes('pass') || normalized.includes('agreed')
}

export function voteIndicatesPassage(result: string): boolean {
  return voteResultIndicatesPassage(normalizeVoteResult(result))
}

export function voteIndicatesFailure(result: string): boolean {
  return voteResultIndicatesFailure(normalizeVoteResult(result))
}

export function getGameCorrectAnswer(result: string): 'passed' | 'failed' | null {
  if (voteIndicatesFailure(result)) return 'failed'
  if (voteIndicatesPassage(result)) return 'passed'
  return null
}

export function isProceduralVoteQuestion(question: string): boolean {
  return PROCEDURAL_VOTE_QUESTION_PATTERN.test(question)
}

export function isProceduralGameVote(title: string | null, question: string): boolean {
  if (title && proceduralHeadline(title) !== null) return true
  return isProceduralVoteQuestion(question)
}

export interface GamePromptInput {
  title: string | null
  question: string
  digest: BillDigestContent | null
  rawSummaryText: string | null
}

export interface GamePrompt {
  headline: string
  snippet: string
}

function pickSummarySource(input: GamePromptInput): string | null {
  const whatItDoes = input.digest?.what_it_does?.trim()
  if (whatItDoes) return normalizeDigestLead(whatItDoes)

  const rawSummary = input.rawSummaryText?.trim()
  if (rawSummary) {
    const body = summaryBodyText(rawSummary)
    if (body) return body
  }

  const firstKeyPoint = input.digest?.key_points?.find((point) => point.trim().length > 0)
  if (firstKeyPoint) return normalizeDigestLead(firstKeyPoint)

  return null
}

function buildHeadline(input: GamePromptInput): string {
  if (input.digest?.headline) {
    return trimDisplayTitle(input.digest.headline)
  }

  const title = input.title ?? ''
  const procedural = proceduralHeadline(title)
  if (procedural) return procedural

  if (input.title) {
    return trimDisplayTitle(input.title)
  }

  return 'Untitled legislation'
}

function textLeaksOutcome(text: string): boolean {
  return OUTCOME_LEAK_PATTERN.test(text)
}

export function buildGamePrompt(input: GamePromptInput): GamePrompt | null {
  if (isProceduralGameVote(input.title, input.question)) return null

  const summarySource = pickSummarySource(input)
  if (!summarySource) return null

  const headline = buildHeadline(input)
  const snippet = truncateAtWordBoundary(summarySource, GAME_SNIPPET_MAX_CHARS)

  if (!snippet || textLeaksOutcome(headline) || textLeaksOutcome(snippet)) {
    return null
  }

  return { headline, snippet }
}

export function shuffleInPlace<T>(items: T[], random: () => number = Math.random): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const temp = items[index]
    items[index] = items[swapIndex]
    items[swapIndex] = temp
  }
}

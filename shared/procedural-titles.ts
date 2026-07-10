import { trimDisplayTitle } from './bill-id'
import { truncateAtWordBoundary } from './digest-format'

const PROVIDING_FOR_CONSIDERATION_PATTERN =
  /^Providing for consideration of the (?:bill|joint resolution|resolution) \(?(H\.?\s?R\.?|H\. ?Res\.?|S\.|S\. ?Res\.?)\s?(\d+)\)?,? (?:to |which )?(.+)$/i

const RULE_WAIVER_PATTERN = /^Waiving a requirement of clause .+ of rule .+/i

const NULLIFICATION_PATTERN = /^Providing that (.+?) shall have no force or effect\.?$/i

const PROCEDURAL_VOTE_QUESTION_PATTERN =
  /cloture|motion to (recommit|table|proceed|discharge)|previous question|point of order|adjourn/i

function normalizeBillRef(typeRaw: string, number: string): string {
  const compact = typeRaw.replace(/\s+/g, '').toUpperCase()
  if (compact === 'HR' || compact === 'H.R') return `H.R. ${number}`
  if (compact.startsWith('H') && compact.includes('RES')) return `H.Res. ${number}`
  if (compact === 'S' || compact === 'S.') return `S. ${number}`
  if (compact.startsWith('S') && compact.includes('RES')) return `S.Res. ${number}`
  return `${typeRaw.trim()} ${number}`
}

function normalizeResolutionRefs(subject: string): string {
  return subject
    .replace(/\bHouse Resolution (\d+)\b/gi, 'H.Res. $1')
    .replace(/\bSenate Resolution (\d+)\b/gi, 'S.Res. $1')
}

function capitalizeFirst(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function extractUnderlyingBillIdFromTitle(title: string): string | null {
  const match = title.match(PROVIDING_FOR_CONSIDERATION_PATTERN)
  if (!match) return null

  const [, billType, billNumber] = match
  return normalizeBillRef(billType, billNumber)
}

export function proceduralHeadline(title: string): string | null {
  if (RULE_WAIVER_PATTERN.test(title)) {
    return 'Fast-tracks floor consideration (rule waiver)'
  }

  const nullification = title.match(NULLIFICATION_PATTERN)
  if (nullification) {
    const subject = truncateAtWordBoundary(normalizeResolutionRefs(nullification[1].trim()), 80)
    return `Nullifies ${subject}`
  }

  const match = title.match(PROVIDING_FOR_CONSIDERATION_PATTERN)
  if (!match) return null

  const [, billType, billNumber, subjectRaw] = match
  const billId = normalizeBillRef(billType, billNumber)
  const subject = truncateAtWordBoundary(capitalizeFirst(trimDisplayTitle(subjectRaw.trim())), 80)

  return `Sets up House debate on ${billId}: ${subject}`
}

function isProceduralVoteQuestion(question: string): boolean {
  return PROCEDURAL_VOTE_QUESTION_PATTERN.test(question)
}

/** Feed/UI policy: title rewrite patterns or procedural floor questions. */
export function isProceduralVote(title: string | null, question: string): boolean {
  if (title && proceduralHeadline(title) !== null) return true
  return isProceduralVoteQuestion(question)
}

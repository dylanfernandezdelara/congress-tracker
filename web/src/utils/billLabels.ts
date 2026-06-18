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

const BOILERPLATE_TITLE_SUFFIX = /,?\s+and for other purposes\.?$/i

const PROVIDING_FOR_CONSIDERATION_PATTERN =
  /^Providing for consideration of the (?:bill|joint resolution|resolution) \(?(H\.?\s?R\.?|H\. ?Res\.?|S\.|S\. ?Res\.?)\s?(\d+)\)?,? (?:to |which )?(.+)$/i

const RULE_WAIVER_PATTERN = /^Waiving a requirement of clause .+ of rule .+/i

const NULLIFICATION_PATTERN = /^Providing that (.+?) shall have no force or effect\.?$/i

export function formatShortBillId(type: string, number: number): string {
  const label = TYPE_LABELS[type.toUpperCase()] ?? type
  return `${label} ${number}`
}

export function formatBillDocket(type: string, number: number, congress: number): string {
  return `${formatShortBillId(type, number)} · ${congress}th Congress`
}

export function extractUnderlyingBillIdFromTitle(title: string): string | null {
  const match = title.match(PROVIDING_FOR_CONSIDERATION_PATTERN)
  if (!match) return null

  const [, billType, billNumber] = match
  return normalizeBillRef(billType, billNumber)
}

export function congressGovBillUrl(congress: number, type: string, number: number): string {
  const seg = type.toLowerCase()
  return `https://www.congress.gov/bill/${congress}th-congress/${seg === 'hr' ? 'house-bill' : seg === 's' ? 'senate-bill' : seg}/${number}`
}

export function formatVoteDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function trimDisplayTitle(title: string): string {
  return title.replace(BOILERPLATE_TITLE_SUFFIX, '').trim()
}

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

export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const slice = text.slice(0, maxLength)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace <= 0) return `${slice.trimEnd()}…`
  return `${slice.slice(0, lastSpace).trimEnd()}…`
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

export function voteIndicatesFailure(result: string): boolean {
  return voteResultIndicatesFailure(normalizeVoteResult(result))
}

export function voteResultClass(result: string): string {
  const normalized = normalizeVoteResult(result)
  if (voteResultIndicatesFailure(normalized)) return 'text-fail'
  if (voteResultIndicatesPassage(normalized)) return 'text-pass'
  return 'text-faint'
}

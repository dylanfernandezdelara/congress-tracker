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

/** Public congress.gov path segment for each bill type code. */
const CONGRESS_GOV_BILL_SEGMENTS: Record<string, string> = {
  HR: 'house-bill',
  S: 'senate-bill',
  HRES: 'house-resolution',
  SRES: 'senate-resolution',
  HCONRES: 'house-concurrent-resolution',
  SCONRES: 'senate-concurrent-resolution',
  HJRES: 'house-joint-resolution',
  SJRES: 'senate-joint-resolution',
}

const BILL_TYPE_TOOLTIPS: Record<string, string> = {
  HR: 'House bill',
  S: 'Senate bill',
}

/** House-origin docket types. Senate-origin bills also use
 *  `in_second_chamber_committee` when they sit in a House committee. */
const HOUSE_ORIGIN_BILL_TYPES = new Set(['HR', 'HRES', 'HJRES', 'HCONRES'])

function normalizeBillTypeCode(type: string): string {
  return type.trim().toUpperCase().replace(/\./g, '')
}

const BILL_QUERY_TYPES = new Set(Object.keys(TYPE_LABELS))

/** Canonical share/deep-link form: `119-hr-1` (type lowercased). */
export function formatBillQueryParam(bill: {
  congress: number
  type: string
  number: number
}): string {
  return `${bill.congress}-${normalizeBillTypeCode(bill.type).toLowerCase()}-${bill.number}`
}

/** Parse `119-hr-1` / `119-HR-1` into congress + canonical type + number. */
export function parseBillQueryParam(
  raw: string | null | undefined,
): { congress: number; type: string; number: number } | null {
  if (raw == null) return null
  const match = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,4})-([a-z]+)-(\d{1,6})$/)
  if (!match) return null
  const congress = Number.parseInt(match[1], 10)
  const type = match[2].toUpperCase()
  const number = Number.parseInt(match[3], 10)
  if (!BILL_QUERY_TYPES.has(type) || congress <= 0 || number <= 0) return null
  return { congress, type, number }
}

export function isHouseOriginBillType(type: string): boolean {
  return HOUSE_ORIGIN_BILL_TYPES.has(normalizeBillTypeCode(type))
}

const SENATE_ORIGIN_BILL_TYPES = new Set(['S', 'SRES', 'SJRES', 'SCONRES'])

/** Originating chamber from docket type (H.R. → House, S. → Senate). */
export function originChamberFromBillType(type: string): 'House' | 'Senate' | null {
  const code = normalizeBillTypeCode(type)
  if (HOUSE_ORIGIN_BILL_TYPES.has(code)) return 'House'
  if (SENATE_ORIGIN_BILL_TYPES.has(code)) return 'Senate'
  return null
}

/** SQL `IN (...)` list for House- or Senate-origin docket types. */
export function originBillTypesSqlList(chamber: 'House' | 'Senate'): string {
  const types = chamber === 'House' ? HOUSE_ORIGIN_BILL_TYPES : SENATE_ORIGIN_BILL_TYPES
  return `(${[...types].map((code) => `'${code}'`).join(',')})`
}

const BOILERPLATE_TITLE_SUFFIX = /,?\s+and for other purposes\.?$/i
const LOCAL_SAMPLE_LABEL = /\s*\(local sample\)\s*/gi

export function formatShortBillId(type: string, number: number): string {
  const label = TYPE_LABELS[type.toUpperCase()] ?? type
  return `${label} ${number}`
}

function getBillTypeTooltip(type: string): string | undefined {
  return BILL_TYPE_TOOLTIPS[type.toUpperCase()]
}

export function formatBillIdParts(
  type: string,
  number: number,
): { prefix: string; number: number; tooltip?: string } {
  const prefix = TYPE_LABELS[type.toUpperCase()] ?? type
  return {
    prefix,
    number,
    tooltip: getBillTypeTooltip(type),
  }
}

/** English ordinal suffix for a congress number (11th/12th/13th special-cased). */
export function congressOrdinal(congress: number): string {
  const abs = Math.abs(congress)
  const mod100 = abs % 100
  if (mod100 >= 11 && mod100 <= 13) return `${congress}th`
  switch (abs % 10) {
    case 1:
      return `${congress}st`
    case 2:
      return `${congress}nd`
    case 3:
      return `${congress}rd`
    default:
      return `${congress}th`
  }
}

export function formatBillDocket(type: string, number: number, congress: number): string {
  return `${formatShortBillId(type, number)} · ${congressOrdinal(congress)} Congress`
}

/**
 * Public congress.gov bill page URL.
 * Uses long-form path segments (`house-bill`, `house-joint-resolution`, …).
 */
export function congressGovBillUrl(congress: number, type: string, number: number): string {
  const key = type.trim().toUpperCase().replace(/\./g, '')
  const segment = CONGRESS_GOV_BILL_SEGMENTS[key] ?? key.toLowerCase()
  return `https://www.congress.gov/bill/${congressOrdinal(congress)}-congress/${segment}/${number}`
}

/** True when a title or headline still carries the offline seed marker. */
export function containsLocalSampleLabel(text: string | null | undefined): boolean {
  if (!text) return false
  return /\(\s*local sample\s*\)/i.test(text)
}

/** Strip offline seed marker from titles/headlines when real data is shown. */
export function stripLocalSampleLabel(text: string): string {
  return text.replace(LOCAL_SAMPLE_LABEL, ' ').replace(/\s+/g, ' ').trim()
}

export function trimDisplayTitle(title: string): string {
  return stripLocalSampleLabel(title.replace(BOILERPLATE_TITLE_SUFFIX, '').trim())
}

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

/** Strip offline seed marker from titles/headlines when real data is shown. */
export function stripLocalSampleLabel(text: string): string {
  return text.replace(LOCAL_SAMPLE_LABEL, ' ').replace(/\s+/g, ' ').trim()
}

export function trimDisplayTitle(title: string): string {
  return stripLocalSampleLabel(title.replace(BOILERPLATE_TITLE_SUFFIX, '').trim())
}

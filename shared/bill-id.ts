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

export function formatBillDocket(type: string, number: number, congress: number): string {
  return `${formatShortBillId(type, number)} · ${congress}th Congress`
}

/** Strip offline seed marker from titles/headlines when real data is shown. */
export function stripLocalSampleLabel(text: string): string {
  return text.replace(LOCAL_SAMPLE_LABEL, ' ').replace(/\s+/g, ' ').trim()
}

export function trimDisplayTitle(title: string): string {
  return stripLocalSampleLabel(title.replace(BOILERPLATE_TITLE_SUFFIX, '').trim())
}

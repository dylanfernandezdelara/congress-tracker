/** Normalized party codes used across worker + web. */

export type PartyCode = 'R' | 'D' | 'I' | 'Other'

const PARTY_META: Record<
  PartyCode,
  { display: string; short: string; legend: string; cssClass: string }
> = {
  R: { display: 'Republican', short: 'R', legend: 'Rep', cssClass: 'party-r' },
  D: { display: 'Democrat', short: 'D', legend: 'Dem', cssClass: 'party-d' },
  I: { display: 'Independent', short: 'I', legend: 'Ind', cssClass: 'party-i' },
  Other: { display: 'Other', short: 'Other', legend: 'Other', cssClass: 'party-other' },
}

export function normalizePartyCode(party: string | null | undefined): PartyCode {
  if (!party) return 'Other'
  const trimmed = party.trim().toUpperCase()
  if (trimmed === 'D' || trimmed === 'DEM' || trimmed === 'DEMOCRAT' || trimmed === 'DEMOCRATIC') {
    return 'D'
  }
  if (trimmed === 'R' || trimmed === 'REP' || trimmed === 'REPUBLICAN') return 'R'
  if (trimmed === 'I' || trimmed === 'IND' || trimmed === 'INDEPENDENT') return 'I'
  return 'Other'
}

export function partyDisplayName(code: string): string {
  const key = normalizePartyCode(code)
  return PARTY_META[key].display
}

export function partyShortLabel(code: string): string {
  const key = normalizePartyCode(code)
  return PARTY_META[key].short
}

/** Compact label for single-row wedge legends (Dem / Rep / Ind). */
export function partyLegendLabel(code: string): string {
  const key = normalizePartyCode(code)
  return PARTY_META[key].legend
}

export function chamberControlLabel(majorityParty: string | null, total: number): string {
  if (!total) return 'No membership data'
  if (!majorityParty) return 'No clear majority'
  return `${partyDisplayName(majorityParty)} control`
}

export function partyCssClass(code: string): string {
  const key = normalizePartyCode(code)
  return PARTY_META[key].cssClass
}

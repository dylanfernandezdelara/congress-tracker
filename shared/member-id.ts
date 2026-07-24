import { normalizePartyCode } from './party'

/** Local seed IDs from scripts/seed-local-feed.sh — not real bioguide identifiers. */
export function isLocalSampleMemberId(bioguideId: string): boolean {
  return bioguideId.startsWith('LOCAL:')
}

/** Senate LIS identifiers from roll-call XML before bioguide resolution. */
export function isLisMemberId(bioguideId: string): boolean {
  return bioguideId.startsWith('LIS:')
}

/** Congress Bioguide ID (e.g. P000197). */
export function isRealBioguideId(bioguideId: string): boolean {
  return /^[A-Za-z]\d{5,6}$/.test(bioguideId)
}

/** Strip combining marks so "Luján" and "Lujan" share a lookup key. */
function normalizeLookupName(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

export function senateMemberLookupKey(lastName: string, state: string, party: string): string {
  return `${normalizeLookupName(lastName)}|${state.trim().toUpperCase()}|${normalizePartyCode(party)}`
}

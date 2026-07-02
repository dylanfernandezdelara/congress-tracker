import { proceduralHeadline } from './feed-content'

/** Notable-votes section only considers passage votes on or after this lookback window. */
export const NOTABLE_VOTES_LOOKBACK_DAYS = 14

const PROCEDURAL_BILL_TYPES = new Set(['HRES', 'HCONRES', 'SRES', 'SCONRES'])

/** Inclusive UTC start date (YYYY-MM-DD) for notable-vote recency filtering. */
export function notableVotesLookbackStartIso(
  asOf: Date = new Date(),
  days: number = NOTABLE_VOTES_LOOKBACK_DAYS,
): string {
  const d = new Date(asOf)
  d.setUTCDate(d.getUTCDate() - (days - 1))
  return d.toISOString().slice(0, 10)
}

const PROCEDURAL_TITLE_MAX_MARGIN = 3
const PROCEDURAL_TITLE_MIN_CROSS_PARTY = 5
const PROCEDURAL_BILL_MAX_MARGIN = 5
const PROCEDURAL_BILL_MIN_CROSS_PARTY = 4

/** Simple resolutions and concurrent resolutions are usually procedural floor business. */
export function isProceduralBillType(billType: string): boolean {
  return PROCEDURAL_BILL_TYPES.has(billType.trim().toUpperCase())
}

/** True when a vote should be filtered out of notable-vote rankings (not significant enough). */
export function isProceduralNotableVote(
  billType: string,
  title: string | null,
  stats: { margin: number; crossPartyBreaks: number },
): boolean {
  if (title && proceduralHeadline(title) !== null) {
    const trulySignificant =
      stats.margin <= PROCEDURAL_TITLE_MAX_MARGIN &&
      stats.crossPartyBreaks >= PROCEDURAL_TITLE_MIN_CROSS_PARTY
    return !trulySignificant
  }
  if (!isProceduralBillType(billType)) return false
  const trulySignificant =
    stats.margin <= PROCEDURAL_BILL_MAX_MARGIN &&
    stats.crossPartyBreaks >= PROCEDURAL_BILL_MIN_CROSS_PARTY
  return !trulySignificant
}

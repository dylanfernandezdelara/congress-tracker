import { normalizePartyCode } from './party'
import type { RollPartySplit, VoteCohesion } from './stats-api-types'

/** Yea share of yeas+nays, or null when the roll has no recorded votes. */
export function yeaShare(yeas: number, nays: number): number | null {
  const total = yeas + nays
  if (total <= 0) return null
  return yeas / total
}

/** Absolute vote gap. Closest-vote bars use this scale, never yea%. */
export function voteMargin(yeas: number, nays: number): number {
  return Math.abs(yeas - nays)
}

/**
 * Party-line when R and D majorities opposed each other; bipartisan when they
 * agreed. A handful of defectors does not flip a party-line roll (HRES 1499
 * R 207–5 / D 2–203 stays party-line). Unknown when either caucus is missing.
 */
export function voteCohesion(splits: RollPartySplit[]): VoteCohesion {
  let republican: RollPartySplit | undefined
  let democrat: RollPartySplit | undefined
  for (const split of splits) {
    const code = normalizePartyCode(split.party)
    if (code === 'R') republican = split
    else if (code === 'D') democrat = split
  }
  if (!republican || !democrat) return 'unknown'
  return republican.party_line === democrat.party_line ? 'bipartisan' : 'party-line'
}

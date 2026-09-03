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

export const HOUSE_MARGIN_CAP = 20
export const SENATE_MARGIN_CAP = 10
export const HOUSE_CLOSEST_LIMIT = 4
export const SENATE_CLOSEST_LIMIT = 3

export type ClosestVoteRoll = {
  yeas: number
  nays: number
  vote_date: string
  roll_number: number
}

export function compareClosestVotes(a: ClosestVoteRoll, b: ClosestVoteRoll): number {
  const margin = voteMargin(a.yeas, a.nays) - voteMargin(b.yeas, b.nays)
  if (margin !== 0) return margin
  return b.vote_date.localeCompare(a.vote_date) || a.roll_number - b.roll_number
}

/** Closest rolls first; drop the steamroll tail beyond the chamber cap. */
export function selectClosestVotes<T extends ClosestVoteRoll>(
  rolls: T[],
  cap: number,
  limit: number,
): T[] {
  return rolls
    .filter((roll) => voteMargin(roll.yeas, roll.nays) <= cap)
    .sort(compareClosestVotes)
    .slice(0, limit)
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

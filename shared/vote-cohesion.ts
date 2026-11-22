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

/** Share of a caucus that may cross before a roll stops reading as party-line. */
export const PARTY_LINE_MAX_CROSSOVER_SHARE = 0.1

function crossoverShare(split: RollPartySplit): number {
  const total = split.yeas + split.nays
  if (total <= 0) return 0
  return (split.party_line === 'yea' ? split.nays : split.yeas) / total
}

/**
 * Party-line when R and D majorities opposed each other and each caucus held
 * together (no more than 10% crossed). A handful of defectors does not flip a
 * party-line roll (HRES 1499 R 207–5 / D 2–203 stays party-line), but a real
 * bloc does: 14 of 44 Democrats joining Republicans (H.R. 2347, 62–33) is
 * bipartisan passage. Unknown when either caucus is missing.
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
  if (republican.party_line === democrat.party_line) return 'bipartisan'
  return crossoverShare(republican) > PARTY_LINE_MAX_CROSSOVER_SHARE ||
    crossoverShare(democrat) > PARTY_LINE_MAX_CROSSOVER_SHARE
    ? 'bipartisan'
    : 'party-line'
}

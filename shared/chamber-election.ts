/** Seats up for election during a Congress cycle — shared by worker + web. */

import type { StatsChamber } from './stats-api-types'

export type { StatsChamber }

/** Senate class seat counts (100 total; Class 3 has one extra). */
const SENATE_CLASS_SEATS: Record<1 | 2 | 3, number> = {
  1: 33,
  2: 33,
  3: 34,
}

const HOUSE_SEATS = 435

/** First year of a Congress (January). */
export function congressStartYear(congress: number): number {
  return (congress - 1) * 2 + 1789
}

/** Federal general election year during this Congress (November). */
export function electionYearForCongress(congress: number): number {
  return congressStartYear(congress) + 1
}

/** Senate class on the ballot for a given even-year election. */
export function senateClassForElectionYear(year: number): 1 | 2 | 3 {
  if (year % 2 !== 0) {
    throw new Error(`Invalid Senate election year: ${year}`)
  }
  // 2024 = Class 1, then rotates Class 2 / Class 3 every two years.
  const cycle = (((year - 2024) / 2) % 3 + 3) % 3
  if (cycle === 0) return 1
  if (cycle === 1) return 2
  return 3
}

export interface SeatsUpForElection {
  seats_up_for_election: number
  election_year: number
}

export function seatsUpForElection(
  chamber: StatsChamber,
  congress: number
): SeatsUpForElection {
  const election_year = electionYearForCongress(congress)

  if (chamber === 'House') {
    return { seats_up_for_election: HOUSE_SEATS, election_year }
  }

  const senateClass = senateClassForElectionYear(election_year)
  return {
    seats_up_for_election: SENATE_CLASS_SEATS[senateClass],
    election_year,
  }
}

export function seatsUpElectionLabel(
  chamber: StatsChamber,
  seats: number,
  year: number
): string {
  if (chamber === 'House') {
    return `Full House election — all ${seats.toLocaleString()} seats on the November ${year} ballot`
  }
  const noun = 'Senate seats'
  return `${seats.toLocaleString()} ${noun} on the November ${year} ballot`
}

/** Whether an individual seat is on the ballot in the current Congress cycle. */

import type { StatsChamber } from './stats-api-types'

/** Proportional fallback when exact senator class is unavailable. */
export function approximateSenateBallotFlags(
  seatParties: string[],
  seatsUpForElection: number
): boolean[] {
  const total = seatParties.length
  if (total === 0 || seatsUpForElection <= 0) return seatParties.map(() => false)
  if (seatsUpForElection >= total) return seatParties.map(() => true)

  const flags = seatParties.map(() => false)
  const partyOrder = ['R', 'D', 'I', 'Other'] as const
  const counts = new Map<string, number>()
  for (const party of seatParties) {
    counts.set(party, (counts.get(party) ?? 0) + 1)
  }

  let assigned = 0
  for (const party of partyOrder) {
    const count = counts.get(party) ?? 0
    if (count === 0) continue
    const share = Math.round((count / total) * seatsUpForElection)
    const toMark = Math.min(count, share, seatsUpForElection - assigned)
    let marked = 0
    for (let i = 0; i < flags.length && marked < toMark; i += 1) {
      if (seatParties[i] === party && !flags[i]) {
        flags[i] = true
        marked += 1
        assigned += 1
      }
    }
  }

  for (let i = 0; i < flags.length && assigned < seatsUpForElection; i += 1) {
    if (!flags[i]) {
      flags[i] = true
      assigned += 1
    }
  }

  return flags
}

export function buildSeatOnBallotFlags(
  chamber: StatsChamber,
  seatParties: string[],
  seatsUpForElection: number
): boolean[] {
  // House: every seat is on the ballot each cycle, but pulsing all tiles is noisy
  // and reads like a bug. Reserve pulse for Senate subsets only.
  if (chamber === 'House') {
    return seatParties.map(() => false)
  }

  const cappedTarget = Math.min(seatParties.length, seatsUpForElection)
  return approximateSenateBallotFlags(seatParties, cappedTarget)
}

export function countBallotSeatsByParty(
  seatParties: string[],
  seatOnBallot: boolean[]
): Map<string, number> {
  const counts = new Map<string, number>()
  seatParties.forEach((party, index) => {
    if (!seatOnBallot[index]) return
    counts.set(party, (counts.get(party) ?? 0) + 1)
  })
  return counts
}

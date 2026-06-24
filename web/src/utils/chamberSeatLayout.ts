import type { PartySeatCount } from '../api/types'

export function partyCounts(seats: PartySeatCount[]): Record<string, number> {
  const counts: Record<string, number> = { D: 0, R: 0, I: 0, Other: 0 }
  for (const entry of seats) {
    if (entry.party in counts) counts[entry.party] += entry.seats
    else counts.Other += entry.seats
  }
  return counts
}

/** One party code per occupied seat — from roster when available, else expanded counts. */
export function resolveSeatParties(
  seats: PartySeatCount[],
  seatParties?: string[] | null
): string[] {
  const total = seats.reduce((sum, entry) => sum + entry.seats, 0)
  if (seatParties && seatParties.length === total) {
    return seatParties
  }
  return expandPartyCountsToSeats(seats)
}

export function expandPartyCountsToSeats(seats: PartySeatCount[]): string[] {
  const expanded: string[] = []
  for (const entry of seats) {
    for (let i = 0; i < entry.seats; i += 1) {
      expanded.push(entry.party)
    }
  }
  return expanded
}

export function seatArcAriaLabel(
  chamber: string,
  seats: PartySeatCount[],
  total: number,
  options?: { perMember?: boolean }
): string {
  const breakdown = seats.map((entry) => `${entry.party} ${entry.seats}`).join(', ')
  if (options?.perMember) {
    return `${chamber} illustrative seating diagram: ${total} seats, each seat colored by member party (${breakdown})`
  }
  return `${chamber} illustrative seating diagram: ${total} seats colored by party totals (${breakdown})`
}

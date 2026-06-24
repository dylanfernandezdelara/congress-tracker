import type { PartySeatCount } from '../api/types'
import { resolveSeatParties } from './chamberSeatLayout'

export type GridSeat = {
  party: string
  onBallot: boolean
}

export type PartySeatBlock = {
  party: string
  seats: GridSeat[]
}

const PARTY_BLOCK_ORDER = ['D', 'I', 'Other', 'R'] as const

export function buildPartySeatBlocks(
  seats: PartySeatCount[],
  seatParties?: string[] | null,
  seatOnBallot?: boolean[] | null
): PartySeatBlock[] {
  const expanded = resolveSeatParties(seats, seatParties)
  const ballot =
    seatOnBallot && seatOnBallot.length === expanded.length
      ? seatOnBallot
      : expanded.map(() => false)

  const grouped = new Map<string, GridSeat[]>()
  expanded.forEach((party, index) => {
    const list = grouped.get(party) ?? []
    list.push({ party, onBallot: ballot[index] ?? false })
    grouped.set(party, list)
  })

  return PARTY_BLOCK_ORDER.filter((party) => grouped.has(party)).map((party) => ({
    party,
    seats: grouped.get(party) ?? [],
  }))
}

export function seatGridAriaLabel(
  chamber: string,
  seats: PartySeatCount[],
  total: number,
  ballotTotal: number,
  electionYear: number,
  options?: { perMember?: boolean }
): string {
  const breakdown = seats.map((entry) => `${entry.party} ${entry.seats}`).join(', ')
  const ballotNote =
    ballotTotal > 0
      ? `${ballotTotal} seats pulsing on the ${electionYear} ballot. `
      : ''
  if (options?.perMember) {
    return `${chamber} party seat blocks: ${total} members (${breakdown}). ${ballotNote}Block width shows party share.`
  }
  return `${chamber} party seat blocks: ${total} seats (${breakdown}). ${ballotNote}Block width shows party share.`
}

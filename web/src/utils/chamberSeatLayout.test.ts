import { describe, expect, it } from 'vitest'

import {
  expandPartyCountsToSeats,
  partyCounts,
  resolveSeatParties,
  seatArcAriaLabel,
} from './chamberSeatLayout'

describe('chamberSeatLayout', () => {
  it('aggregates party seat totals', () => {
    expect(
      partyCounts([
        { party: 'R', seats: 53 },
        { party: 'D', seats: 45 },
        { party: 'I', seats: 2 },
      ])
    ).toEqual({ D: 45, R: 53, I: 2, Other: 0 })
  })

  it('expands aggregate counts into one party code per seat', () => {
    expect(
      expandPartyCountsToSeats([
        { party: 'R', seats: 2 },
        { party: 'D', seats: 1 },
      ])
    ).toEqual(['R', 'R', 'D'])
  })

  it('prefers roster seat parties when provided', () => {
    const roster = ['D', 'R', 'I']
    expect(
      resolveSeatParties(
        [
          { party: 'D', seats: 1 },
          { party: 'R', seats: 1 },
          { party: 'I', seats: 1 },
        ],
        roster
      )
    ).toEqual(roster)
  })

  it('builds accessible labels for aggregate and per-member modes', () => {
    const seats = [
      { party: 'R', seats: 53 },
      { party: 'D', seats: 47 },
    ]
    expect(seatArcAriaLabel('Senate', seats, 100)).toContain('party totals')
    expect(seatArcAriaLabel('Senate', seats, 100, { perMember: true })).toContain('member party')
  })
})

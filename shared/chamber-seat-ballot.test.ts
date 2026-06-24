import { describe, expect, it } from 'vitest'

import {
  approximateSenateBallotFlags,
  buildSeatOnBallotFlags,
  countBallotSeatsByParty,
} from './chamber-seat-ballot'

describe('chamber-seat-ballot', () => {
  it('marks every House seat on the ballot', () => {
    const flags = buildSeatOnBallotFlags('House', ['D', 'R', 'R'], 435)
    expect(flags).toEqual([true, true, true])
  })

  it('uses Class II states when member states are available', () => {
    const flags = buildSeatOnBallotFlags(
      'Senate',
      ['R', 'D'],
      33,
      ['TX', 'CA']
    )
    expect(flags).toEqual([true, false])
  })

  it('falls back when member states are all missing', () => {
    const flags = buildSeatOnBallotFlags('Senate', ['R', 'D', 'I'], 33, [null, null, null])
    expect(flags.filter(Boolean)).toHaveLength(3)
  })

  it('approximates Senate ballot totals when class is unavailable', () => {
    const parties = [
      ...Array.from({ length: 53 }, () => 'R'),
      ...Array.from({ length: 45 }, () => 'D'),
      ...Array.from({ length: 2 }, () => 'I'),
    ]
    const flags = approximateSenateBallotFlags(parties, 33)
    expect(flags.filter(Boolean)).toHaveLength(33)
  })

  it('counts ballot seats by party', () => {
    const parties = ['R', 'R', 'D']
    const flags = [true, false, true]
    expect(countBallotSeatsByParty(parties, flags)).toEqual(
      new Map([
        ['R', 1],
        ['D', 1],
      ])
    )
  })
})

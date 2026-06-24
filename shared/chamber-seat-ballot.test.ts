import { describe, expect, it } from 'vitest'

import {
  approximateSenateBallotFlags,
  buildSeatOnBallotFlags,
  countBallotSeatsByParty,
} from './chamber-seat-ballot'

describe('chamber-seat-ballot', () => {
  it('does not pulse House tiles — full chamber election is noted in copy instead', () => {
    const flags = buildSeatOnBallotFlags('House', ['D', 'R', 'R'], 435)
    expect(flags).toEqual([false, false, false])
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

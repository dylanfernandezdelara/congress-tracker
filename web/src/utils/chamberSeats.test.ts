import { describe, expect, it } from 'vitest'

import { sortPartySeatCounts } from './chamberSeats'

describe('sortPartySeatCounts', () => {
  it('orders parties D, I, R, then other', () => {
    const sorted = sortPartySeatCounts([
      { party: 'R', seats: 220 },
      { party: 'Other', seats: 1 },
      { party: 'D', seats: 214 },
      { party: 'I', seats: 1 },
    ])

    expect(sorted.map((entry) => entry.party)).toEqual(['D', 'I', 'R', 'Other'])
  })
})

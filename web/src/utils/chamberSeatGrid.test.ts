import { describe, expect, it } from 'vitest'

import type { PartySeatCount } from '../api/types'
import { buildPartySeatBlocks } from './chamberSeatGrid'

describe('chamberSeatGrid', () => {
  const seats: PartySeatCount[] = [
    { party: 'R', seats: 53 },
    { party: 'D', seats: 45 },
    { party: 'I', seats: 2 },
  ]

  it('groups seats into party blocks ordered D, I, R', () => {
    const blocks = buildPartySeatBlocks(seats)
    expect(blocks.map((block) => block.party)).toEqual(['D', 'I', 'R'])
    expect(blocks.reduce((sum, block) => sum + block.seats.length, 0)).toBe(100)
  })

  it('carries ballot flags onto tiles', () => {
    const seatParties = [
      ...Array.from({ length: 45 }, () => 'D'),
      ...Array.from({ length: 2 }, () => 'I'),
      ...Array.from({ length: 53 }, () => 'R'),
    ]
    const seatOnBallot = seatParties.map((_, index) => index % 3 === 0)
    const blocks = buildPartySeatBlocks(seats, seatParties, seatOnBallot)
    const pulsing = blocks.flatMap((block) => block.seats.filter((seat) => seat.onBallot))
    expect(pulsing.length).toBeGreaterThan(0)
  })
})

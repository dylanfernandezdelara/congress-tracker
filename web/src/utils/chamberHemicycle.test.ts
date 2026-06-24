import { describe, expect, it } from 'vitest'

import { buildChamberHemicycle, buildHemicycleSeatData } from './chamberHemicycle'

describe('chamberHemicycle', () => {
  it('assigns Democrats to the left and Republicans to the right', () => {
    const { seats } = buildChamberHemicycle('Senate', [
      { party: 'D', seats: 45 },
      { party: 'R', seats: 53 },
      { party: 'I', seats: 2 },
    ])

    expect(seats).toHaveLength(100)
    const dOnLeft = seats.filter((seat) => seat.party === 'D' && seat.layout.x < 0).length
    const rOnRight = seats.filter((seat) => seat.party === 'R' && seat.layout.x > 0).length
    expect(dOnLeft).toBeGreaterThan(40)
    expect(rOnRight).toBeGreaterThan(48)
  })

  it('builds react seat data with one entry per idx', () => {
    const { data } = buildHemicycleSeatData('Senate', [
      { party: 'D', seats: 45 },
      { party: 'R', seats: 53 },
      { party: 'I', seats: 2 },
    ])
    expect(data).toHaveLength(100)
    expect(new Set(data.map((entry) => entry.idx)).size).toBe(100)
  })
})

import { describe, expect, it } from 'vitest'

import { buildChamberHemicycle, hemicycleSeatsTo3D } from './chamberHemicycle'

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

  it('maps hemicycle seats into compact 3D coordinates', () => {
    const built = buildChamberHemicycle('Senate', [
      { party: 'D', seats: 45 },
      { party: 'R', seats: 53 },
      { party: 'I', seats: 2 },
    ])
    const cells = hemicycleSeatsTo3D('Senate', built.seats)
    expect(cells).toHaveLength(100)
    expect(cells.every((cell) => cell.radius > 0)).toBe(true)
  })
})

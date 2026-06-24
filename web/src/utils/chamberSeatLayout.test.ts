import { describe, expect, it } from 'vitest'

import { layoutHorseshoeSeats } from './chamberSeatLayout'

describe('chamberSeatLayout', () => {
  it('assigns Democrats to the left arc and Republicans to the right', () => {
    const cells = layoutHorseshoeSeats('Senate', [
      { party: 'D', seats: 45 },
      { party: 'R', seats: 53 },
      { party: 'I', seats: 2 },
    ])

    expect(cells).toHaveLength(100)
    expect(cells.filter((cell) => cell.party === 'D')).toHaveLength(45)
    expect(cells.filter((cell) => cell.party === 'R')).toHaveLength(53)
    expect(cells.filter((cell) => cell.party === 'I')).toHaveLength(2)
    const dOnLeft = cells.filter((cell) => cell.party === 'D' && cell.angle >= Math.PI / 2).length
    const rOnRight = cells.filter((cell) => cell.party === 'R' && cell.angle <= Math.PI / 2).length
    expect(dOnLeft).toBeGreaterThan(40)
    expect(rOnRight).toBeGreaterThan(48)
  })

  it('assigns every seat without dropping overflow independents', () => {
    const cells = layoutHorseshoeSeats('House', [
      { party: 'D', seats: 215 },
      { party: 'R', seats: 205 },
      { party: 'I', seats: 15 },
    ])
    expect(cells).toHaveLength(435)
    expect(cells.filter((cell) => cell.party === 'I')).toHaveLength(15)
  })

  it('lays out one cell per seat in a hemicycle', () => {
    const cells = layoutHorseshoeSeats('Senate', [
      { party: 'D', seats: 1 },
      { party: 'R', seats: 2 },
    ])
    expect(cells).toHaveLength(3)
    expect(cells.every((cell) => typeof cell.x === 'number' && typeof cell.z === 'number')).toBe(true)
  })
})

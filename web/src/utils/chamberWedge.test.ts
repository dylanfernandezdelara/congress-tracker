import { describe, expect, it } from 'vitest'

import { buildVisualWedgeSegments, MIN_WEDGE_SWEEP } from './chamberWedge'

describe('chamberWedge', () => {
  it('spans a full semicircle after min-sliver adjustment', () => {
    const segments = buildVisualWedgeSegments(
      [
        { party: 'D', seats: 214 },
        { party: 'I', seats: 1 },
        { party: 'R', seats: 220 },
      ],
      435
    )

    expect(segments).toHaveLength(3)
    const totalSweep = segments.reduce((sum, segment) => sum + segment.sweep, 0)
    expect(totalSweep).toBeCloseTo(Math.PI, 5)
    expect(segments[0]?.party).toBe('D')
    expect(segments[1]?.party).toBe('I')
    expect(segments[2]?.party).toBe('R')
  })

  it('enlarges independent sliver below the minimum sweep', () => {
    const segments = buildVisualWedgeSegments(
      [
        { party: 'D', seats: 214 },
        { party: 'I', seats: 1 },
        { party: 'R', seats: 220 },
      ],
      435
    )
    const independent = segments.find((segment) => segment.party === 'I')
    expect(independent?.sweep).toBeGreaterThanOrEqual(MIN_WEDGE_SWEEP * 0.99)
  })

  it('orders parties D, I, R left to right', () => {
    const segments = buildVisualWedgeSegments(
      [
        { party: 'R', seats: 53 },
        { party: 'I', seats: 2 },
        { party: 'D', seats: 45 },
      ],
      100
    )
    expect(segments.map((segment) => segment.party)).toEqual(['D', 'I', 'R'])
    expect(segments[0]?.start).toBeCloseTo(Math.PI, 5)
    expect(segments[segments.length - 1]?.end).toBeCloseTo(2 * Math.PI, 5)
  })
})

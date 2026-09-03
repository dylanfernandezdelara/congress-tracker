import { describe, expect, it } from 'vitest'

import { tightnessAxisPosition, voteCohesion, yeaShare } from './vote-cohesion'

describe('yeaShare', () => {
  it('returns the yea fraction of the recorded tally', () => {
    expect(yeaShare(210, 208)).toBeCloseTo(210 / 418)
    expect(yeaShare(421, 1)).toBeCloseTo(421 / 422)
  })

  it('returns null when nobody voted', () => {
    expect(yeaShare(0, 0)).toBeNull()
  })
})

describe('tightnessAxisPosition', () => {
  it('maps 50% to the left edge and 100% to the right', () => {
    expect(tightnessAxisPosition(0.5)).toBe(0)
    expect(tightnessAxisPosition(1)).toBe(1)
    expect(tightnessAxisPosition(0.75)).toBe(0.5)
  })

  it('clamps failed or empty rolls to the knife-edge end', () => {
    expect(tightnessAxisPosition(0.49)).toBe(0)
    expect(tightnessAxisPosition(null)).toBe(0)
  })
})

describe('voteCohesion', () => {
  it('treats opposite caucus lines as party-line even with a few defectors', () => {
    expect(
      voteCohesion([
        { party: 'R', yeas: 207, nays: 5, party_line: 'yea' },
        { party: 'D', yeas: 2, nays: 203, party_line: 'nay' },
      ]),
    ).toBe('party-line')
  })

  it('treats matching caucus lines as bipartisan (HR 1118-style steamroll)', () => {
    expect(
      voteCohesion([
        { party: 'R', yeas: 218, nays: 0, party_line: 'yea' },
        { party: 'D', yeas: 203, nays: 1, party_line: 'yea' },
      ]),
    ).toBe('bipartisan')
  })

  it('is unknown without both major parties', () => {
    expect(voteCohesion([{ party: 'R', yeas: 50, nays: 0, party_line: 'yea' }])).toBe(
      'unknown',
    )
    expect(voteCohesion([])).toBe('unknown')
  })
})

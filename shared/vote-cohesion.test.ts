import { describe, expect, it } from 'vitest'

import { voteCohesion, voteMargin, yeaShare } from './vote-cohesion'

describe('yeaShare', () => {
  it('returns the yea fraction of the recorded tally', () => {
    expect(yeaShare(210, 208)).toBeCloseTo(210 / 418)
    expect(yeaShare(421, 1)).toBeCloseTo(421 / 422)
  })

  it('returns null when nobody voted', () => {
    expect(yeaShare(0, 0)).toBeNull()
  })
})

describe('voteMargin', () => {
  it('is the absolute yea–nay gap', () => {
    expect(voteMargin(210, 208)).toBe(2)
    expect(voteMargin(212, 206)).toBe(6)
    expect(voteMargin(218, 201)).toBe(17)
    expect(voteMargin(421, 1)).toBe(420)
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

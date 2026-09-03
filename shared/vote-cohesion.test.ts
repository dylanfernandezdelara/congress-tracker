import { describe, expect, it } from 'vitest'

import {
  HOUSE_CLOSEST_LIMIT,
  HOUSE_MARGIN_CAP,
  SENATE_CLOSEST_LIMIT,
  SENATE_MARGIN_CAP,
  compareClosestVotes,
  selectClosestVotes,
  voteCohesion,
  voteMargin,
  yeaShare,
} from './vote-cohesion'

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

describe('selectClosestVotes', () => {
  it('sorts closest first and drops the steamroll tail', () => {
    const selected = selectClosestVotes(
      [
        { yeas: 421, nays: 1, vote_date: '2026-07-21', roll_number: 9012 },
        { yeas: 218, nays: 201, vote_date: '2026-07-21', roll_number: 9005 },
        { yeas: 210, nays: 208, vote_date: '2026-07-22', roll_number: 9010 },
        { yeas: 212, nays: 206, vote_date: '2026-07-20', roll_number: 9013 },
      ],
      HOUSE_MARGIN_CAP,
      HOUSE_CLOSEST_LIMIT,
    )
    expect(selected.map((roll) => `${roll.yeas}–${roll.nays}`)).toEqual([
      '210–208',
      '212–206',
      '218–201',
    ])
  })

  it('caps House at 4 and Senate at 3', () => {
    const house = Array.from({ length: 8 }, (_, index) => ({
      yeas: 210 + index,
      nays: 208,
      vote_date: '2026-07-22',
      roll_number: 8100 + index,
    }))
    const senate = Array.from({ length: 6 }, (_, index) => ({
      yeas: 51 + index,
      nays: 49,
      vote_date: '2026-07-22',
      roll_number: 9100 + index,
    }))
    expect(selectClosestVotes(house, HOUSE_MARGIN_CAP, HOUSE_CLOSEST_LIMIT)).toHaveLength(4)
    expect(selectClosestVotes(senate, SENATE_MARGIN_CAP, SENATE_CLOSEST_LIMIT)).toHaveLength(3)
    expect(compareClosestVotes(house[0]!, house[1]!)).toBeLessThan(0)
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

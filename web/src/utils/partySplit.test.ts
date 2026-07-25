import { describe, expect, it } from 'vitest'

import type { RollPartySplit, VoteDefectorEntry } from '../api/types'
import {
  formatPartySplits,
  groupDefectorsByParty,
  partyCode,
  partyNoun,
} from './partySplit'

function defector(
  overrides: Partial<VoteDefectorEntry> & Pick<VoteDefectorEntry, 'bioguide_id'>,
): VoteDefectorEntry {
  return {
    name: `Rep. ${overrides.bioguide_id}`,
    party: 'D',
    state: 'CA',
    position: 'yea',
    party_line: 'nay',
    congress_gov_url: 'https://www.congress.gov/member/x',
    ...overrides,
  }
}

const hr7008Splits: RollPartySplit[] = [
  { party: 'R', yeas: 218, nays: 0, party_line: 'yea' },
  { party: 'D', yeas: 13, nays: 198, party_line: 'nay' },
]

describe('partyCode', () => {
  it('normalizes the spellings that reach the UI', () => {
    expect(partyCode('R')).toBe('R')
    expect(partyCode('Republican')).toBe('R')
    expect(partyCode('democrat')).toBe('D')
    expect(partyCode('Independent')).toBe('I')
    expect(partyCode(null)).toBe('?')
  })
})

describe('partyNoun', () => {
  it('agrees with the count', () => {
    expect(partyNoun('D', 1)).toBe('Democrat')
    expect(partyNoun('D', 13)).toBe('Democrats')
    expect(partyNoun('R', 2)).toBe('Republicans')
  })
})

describe('formatPartySplits', () => {
  it('renders one compact segment per party', () => {
    expect(formatPartySplits(hr7008Splits)).toBe('R 218–0 · D 13–198')
  })

  it('renders nothing for an empty split', () => {
    expect(formatPartySplits([])).toBe('')
  })
})

describe('groupDefectorsByParty', () => {
  it('states the share of the caucus that broke ranks', () => {
    const defectors = Array.from({ length: 13 }, (_, i) =>
      defector({ bioguide_id: `D${i}`, party: 'D', position: 'yea', party_line: 'nay' }),
    )

    const groups = groupDefectorsByParty(defectors, hr7008Splits)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.partyTotal).toBe(211)
    expect(groups[0]?.summary).toBe(
      '13 of 211 Democrats voted Yea — the caucus voted Nay.',
    )
  })

  it('separates parties and orders the largest group first', () => {
    const groups = groupDefectorsByParty(
      [
        defector({ bioguide_id: 'R1', party: 'R', position: 'nay', party_line: 'yea' }),
        defector({ bioguide_id: 'D1', party: 'D', position: 'yea', party_line: 'nay' }),
        defector({ bioguide_id: 'D2', party: 'D', position: 'yea', party_line: 'nay' }),
      ],
      hr7008Splits,
    )

    expect(groups.map((group) => group.party)).toEqual(['D', 'R'])
    expect(groups[1]?.summary).toBe('1 of 218 Republicans voted Nay — the caucus voted Yea.')
  })

  it('drops the caucus total when party splits are unavailable', () => {
    const groups = groupDefectorsByParty(
      [defector({ bioguide_id: 'D1', party: 'D' })],
      [],
    )

    expect(groups[0]?.partyTotal).toBeNull()
    expect(groups[0]?.summary).toBe('1 Democrat voted Yea — the caucus voted Nay.')
  })

  it('keeps opposite-side defectors from the same party in separate groups', () => {
    const groups = groupDefectorsByParty(
      [
        defector({ bioguide_id: 'D1', party: 'D', position: 'yea', party_line: 'nay' }),
        defector({ bioguide_id: 'D2', party: 'D', position: 'nay', party_line: 'yea' }),
      ],
      [],
    )

    expect(groups).toHaveLength(2)
  })
})

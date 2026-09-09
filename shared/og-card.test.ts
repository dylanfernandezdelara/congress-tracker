import { describe, expect, it } from 'vitest'

import {
  ogCardBarSegments,
  ogCardImagePath,
  ogCardVersion,
  truncateForCard,
  type OgCardModel,
} from './og-card'

const model: OgCardModel = {
  docket: 'H.R. 1 · 119th Congress',
  headline: 'House passes a permitting package',
  quote: null,
  status_line: 'Passed House 219–213 · Sep 3, 2026',
  tally: { chamber: 'House', yeas: 219, nays: 213, party_splits: [] },
}

describe('og card model helpers', () => {
  it('orders bar segments yea by party then nay mirrored', () => {
    const segments = ogCardBarSegments({
      chamber: 'House',
      yeas: 219,
      nays: 213,
      party_splits: [
        { party: 'R', yeas: 217, nays: 2, party_line: 'yea' },
        { party: 'D', yeas: 2, nays: 210, party_line: 'nay' },
        { party: 'I', yeas: 0, nays: 1, party_line: 'nay' },
      ],
    })
    expect(segments.map((s) => `${s.party}:${s.side}:${s.count}`)).toEqual([
      'D:yea:2',
      'R:yea:217',
      'R:nay:2',
      'I:nay:1',
      'D:nay:210',
    ])
  })

  it('falls back to a two-segment bar without party splits and none for empty tallies', () => {
    expect(ogCardBarSegments(model.tally!)).toEqual([
      { party: 'Other', side: 'yea', count: 219 },
      { party: 'Other', side: 'nay', count: 213 },
    ])
    expect(ogCardBarSegments({ chamber: 'Senate', yeas: 0, nays: 0, party_splits: [] })).toEqual([])
  })

  it('truncates on a word boundary with an ellipsis', () => {
    expect(truncateForCard('short text', 40)).toBe('short text')
    const long = 'The quick brown fox jumps over the lazy dog again and again'
    const cut = truncateForCard(long, 30)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(30)
    expect(cut).not.toMatch(/\s…$/)
  })

  it('builds a versioned image path scoped to the quote', () => {
    const version = ogCardVersion(model)
    expect(version).toMatch(/^[0-9a-f]{8}$/)
    expect(ogCardVersion(model)).toBe(version)
    expect(ogCardVersion({ ...model, headline: 'Other' })).not.toBe(version)
    expect(
      ogCardImagePath({ congress: 119, type: 'HR', number: 1 }, { quoteId: 'abc123ff', version }),
    ).toBe(`/og/bill/119-hr-1.png?q=abc123ff&v=${version}`)
    expect(ogCardImagePath({ congress: 119, type: 'S', number: 2 }, { version })).toBe(
      `/og/bill/119-s-2.png?v=${version}`,
    )
  })
})

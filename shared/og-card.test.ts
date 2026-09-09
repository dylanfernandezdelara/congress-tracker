import { describe, expect, it } from 'vitest'

import {
  buildStatusLine,
  formatCardDate,
  ogCardBarSegments,
  ogCardImagePath,
  ogCardLegend,
  ogCardStatusChipLabel,
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
    ).toBe(`/og/bill/119-hr-1.png?quote=abc123ff&v=${version}`)
    expect(ogCardImagePath({ congress: 119, type: 'S', number: 2 }, { version })).toBe(
      `/og/bill/119-s-2.png?v=${version}`,
    )
  })

  it('formats status lines: enactment, veto, newest vote, then intro', () => {
    const vote = { chamber: 'House', yeas: 219, nays: 213, result: 'Passed', vote_date: '2026-09-03' }
    expect(formatCardDate('2026-09-03T00:00:00Z')).toBe('Sep 3, 2026')
    expect(formatCardDate('nonsense')).toBeNull()
    expect(buildStatusLine({ latestVote: vote, becameLawDate: null, vetoedDate: null })).toBe(
      'Passed House 219–213 · Sep 3, 2026',
    )
    expect(
      buildStatusLine({ latestVote: { ...vote, result: 'Failed' }, becameLawDate: null, vetoedDate: null }),
    ).toBe('Failed House 219–213 · Sep 3, 2026')
    expect(buildStatusLine({ latestVote: vote, becameLawDate: '2026-09-10', vetoedDate: null })).toBe(
      'Became law · Sep 10, 2026',
    )
    expect(buildStatusLine({ latestVote: vote, becameLawDate: null, vetoedDate: '2026-09-11' })).toBe(
      'Vetoed · Sep 11, 2026',
    )
    expect(buildStatusLine({ latestVote: null, becameLawDate: null, vetoedDate: null })).toBe(
      'Introduced · In committee',
    )
    expect(ogCardStatusChipLabel('Introduced · In committee')).toBe('In committee')
    expect(ogCardStatusChipLabel('Introduced')).toBe('In committee')
  })

  it('labels the legend with party prefixes only when splits exist', () => {
    expect(ogCardLegend({ chamber: 'House', yeas: 5, nays: 3, party_splits: [] })).toEqual({
      yea: 'Yea 5',
      nay: 'Nay 3',
    })
    expect(
      ogCardLegend({
        chamber: 'House',
        yeas: 5,
        nays: 3,
        party_splits: [
          { party: 'R', yeas: 4, nays: 1, party_line: 'yea' },
          { party: 'D', yeas: 1, nays: 2, party_line: 'nay' },
        ],
      }),
    ).toEqual({ yea: 'Yea 5 · D 1 · R 4', nay: 'Nay 3 · R 1 · D 2' })
  })

  it('drops party detail when member splits do not reconcile with the roll tally', () => {
    const tally = {
      chamber: 'House' as const,
      yeas: 220,
      nays: 213,
      party_splits: [
        { party: 'R', yeas: 219, nays: 0, party_line: 'yea' as const },
        { party: 'D', yeas: 211, nays: 1, party_line: 'yea' as const },
      ],
    }
    expect(ogCardBarSegments(tally)).toEqual([
      { party: 'Other', side: 'yea', count: 220 },
      { party: 'Other', side: 'nay', count: 213 },
    ])
    expect(ogCardLegend(tally)).toEqual({ yea: 'Yea 220', nay: 'Nay 213' })
  })
})

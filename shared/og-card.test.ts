import { describe, expect, it } from 'vitest'

import {
  buildStatusLine,
  formatCardDate,
  OG_CARD_DESIGN,
  ogCardImagePath,
  ogCardSideSegments,
  ogCardVersion,
  requiresTwoThirds,
  truncateForCard,
  type OgCardModel,
} from './og-card'

const model: OgCardModel = {
  bill_label: 'H.R. 1',
  docket: 'H.R. 1 · 119th Congress',
  headline: 'House passes a permitting package',
  outcome: 'passed',
  outcome_label: 'Passed House',
  outcome_date: null,
  status_line: 'Passed House 219–213 · Sep 3, 2026',
  tally: { chamber: 'House', yeas: 219, nays: 213, party_splits: [] },
  two_thirds: false,
}

describe('og card model helpers', () => {
  it('splits each side by party in D, I, Other, R order, skipping parties with no votes on that side', () => {
    const tally = {
      chamber: 'House' as const,
      yeas: 219,
      nays: 213,
      party_splits: [
        { party: 'R', yeas: 217, nays: 2, party_line: 'yea' as const },
        { party: 'D', yeas: 2, nays: 210, party_line: 'nay' as const },
        { party: 'I', yeas: 0, nays: 1, party_line: 'nay' as const },
      ],
    }
    expect(ogCardSideSegments(tally, 'yea')).toEqual([
      { party: 'D', count: 2 },
      { party: 'R', count: 217 },
    ])
    expect(ogCardSideSegments(tally, 'nay')).toEqual([
      { party: 'D', count: 210 },
      { party: 'I', count: 1 },
      { party: 'R', count: 2 },
    ])
  })

  it('uses one neutral segment when splits are missing or do not reconcile, and none for an empty side', () => {
    expect(ogCardSideSegments(model.tally!, 'yea')).toEqual([{ party: 'Other', count: 219 }])
    const mismatched = {
      chamber: 'House' as const,
      yeas: 220,
      nays: 213,
      party_splits: [
        { party: 'R', yeas: 219, nays: 0, party_line: 'yea' as const },
        { party: 'D', yeas: 211, nays: 1, party_line: 'yea' as const },
      ],
    }
    expect(ogCardSideSegments(mismatched, 'nay')).toEqual([{ party: 'Other', count: 213 }])
    expect(ogCardSideSegments({ chamber: 'Senate', yeas: 97, nays: 0, party_splits: [] }, 'nay')).toEqual([])
  })

  it('knows which votes need two-thirds', () => {
    const hr = { billType: 'HR', officialTitle: 'A bill' }
    expect(requiresTwoThirds({ ...hr, question: 'On Motion to Suspend the Rules and Pass, as Amended' })).toBe(true)
    expect(requiresTwoThirds({ ...hr, question: 'On Overriding the Veto' })).toBe(true)
    expect(requiresTwoThirds({ ...hr, question: 'On Passage' })).toBe(false)
    expect(requiresTwoThirds({ ...hr, question: null })).toBe(false)
    const amendment = 'Proposing an amendment to the Constitution of the United States relative to the Court.'
    expect(requiresTwoThirds({ billType: 'hjres', officialTitle: amendment, question: 'On Passage' })).toBe(true)
    expect(requiresTwoThirds({ billType: 'HR', officialTitle: amendment, question: 'On Passage' })).toBe(false)
  })

  it('truncates on a word boundary with an ellipsis', () => {
    expect(truncateForCard('short text', 40)).toBe('short text')
    const long = 'The quick brown fox jumps over the lazy dog again and again'
    const cut = truncateForCard(long, 30)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(30)
    expect(cut).not.toMatch(/\s…$/)
  })

  it('versions the image path by what the card shows, including the design', () => {
    const version = ogCardVersion(model)
    expect(version).toMatch(/^[0-9a-f]{8}$/)
    expect(ogCardVersion(model)).toBe(version)
    expect(ogCardVersion({ ...model, headline: 'Other' })).not.toBe(version)
    expect(ogCardVersion({ ...model, two_thirds: true })).not.toBe(version)
    expect(ogCardVersion({ ...model, outcome_label: 'Failed House' })).not.toBe(version)
    expect(OG_CARD_DESIGN).toBeTruthy()
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
  })
})

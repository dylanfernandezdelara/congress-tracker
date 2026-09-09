import { describe, expect, it } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import { buildOgCardModelFromFeedItem, latestPassageVote } from './ogCardModel'

describe('ogCardModel', () => {
  it('builds the headline card with the newest passage vote as the tally', () => {
    const item = makeFeedItem({
      passage_votes: [
        {
          chamber: 'House',
          congress: 119,
          session: 2,
          roll_number: 100,
          question: 'On Passage',
          result: 'Passed',
          yeas: 220,
          nays: 210,
          date: '2026-05-01',
        },
        {
          chamber: 'Senate',
          congress: 119,
          session: 2,
          roll_number: 9002,
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 52,
          nays: 47,
          date: '2026-06-05',
        },
      ],
    })
    const model = buildOgCardModelFromFeedItem(item)
    expect(latestPassageVote(item.passage_votes)?.roll_number).toBe(9002)
    expect(model).toMatchObject({
      docket: 'S. 2 · 119th Congress',
      headline: 'Plain headline for readers',
      quote: null,
      status_line: 'Passed Senate 52–47 · Jun 5, 2026',
      tally: { chamber: 'Senate', yeas: 52, nays: 47, party_splits: [] },
    })
  })

  it('puts the quote first and carries party splits when provided', () => {
    const splits = [
      { party: 'D', yeas: 45, nays: 2, party_line: 'yea' as const },
      { party: 'R', yeas: 7, nays: 45, party_line: 'nay' as const },
    ]
    const model = buildOgCardModelFromFeedItem(makeFeedItem(), {
      quote: 'It does something important in plain language.',
      partySplits: splits,
    })
    expect(model.quote).toBe('It does something important in plain language.')
    expect(model.tally?.party_splits).toEqual(splits)
  })

  it('drops the tally for bills with no passage vote and prefers enactment in the status', () => {
    const intro = buildOgCardModelFromFeedItem(makeFeedItem({ passage_votes: [] }))
    expect(intro.tally).toBeNull()
    expect(intro.status_line).toBe('Introduced · In committee')

    const law = buildOgCardModelFromFeedItem(
      makeFeedItem({
        lifecycle: {
          became_law_date: '2026-07-04',
          vetoed_date: null,
        } as never,
      }),
    )
    expect(law.status_line).toBe('Became law · Jul 4, 2026')
  })

  it('falls back to the official title, then docket, when there is no digest headline', () => {
    const model = buildOgCardModelFromFeedItem(
      makeFeedItem({
        digest: null,
        bill: { congress: 119, type: 'HR', number: 10, title: 'Clean Water Act of 2026' },
      }),
    )
    expect(model.headline).toBe('Clean Water Act of 2026')
  })
})

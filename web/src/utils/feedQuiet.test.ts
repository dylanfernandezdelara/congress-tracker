import { describe, expect, it } from 'vitest'

import { feedQuietCopy, latestPassageDateAmong } from './feedQuiet'

describe('latestPassageDateAmong', () => {
  it('picks the max vote-only passage day and skips executive timestamps', () => {
    expect(
      latestPassageDateAmong([
        {
          latest_passage_date: '2026-04-10',
        },
        {
          latest_passage_date: null,
        },
        {
          latest_passage_date: '2026-08-08T16:00:00.000Z',
        },
      ]),
    ).toBe('2026-08-08')
  })

  it('returns null when no row has a passage date', () => {
    expect(latestPassageDateAmong([{ latest_passage_date: null }])).toBeNull()
    expect(latestPassageDateAmong([])).toBeNull()
  })
})

describe('feedQuietCopy', () => {
  const now = new Date('2026-08-25T20:00:00.000Z')

  it('returns through-label without a notice for a fresh floor', () => {
    expect(feedQuietCopy('2026-08-24', now)).toEqual({
      throughLabel: 'Aug 24',
      notice: null,
    })
  })

  it('explains a quiet floor instead of looking stuck', () => {
    expect(feedQuietCopy('2026-08-08', now)).toEqual({
      throughLabel: 'Aug 8',
      notice: 'No new House or Senate passage votes since Aug 8.',
    })
  })

  it('names a single chamber when the timeline is filtered', () => {
    expect(feedQuietCopy('2026-08-08', now, 'House')).toEqual({
      throughLabel: 'Aug 8',
      notice: 'No new House passage votes since Aug 8.',
    })
  })

  it('uses the UTC calendar day of a datetime so through-labels stay valid', () => {
    expect(feedQuietCopy('2026-08-08T14:26:00.000Z', now)).toEqual({
      throughLabel: 'Aug 8',
      notice: 'No new House or Senate passage votes since Aug 8.',
    })
  })

  it('returns empty copy when the feed has no passage date', () => {
    expect(feedQuietCopy(null, now)).toEqual({ throughLabel: null, notice: null })
    expect(feedQuietCopy('not-a-date', now)).toEqual({ throughLabel: null, notice: null })
  })
})

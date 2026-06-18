import { describe, expect, it } from 'vitest'

import type { FeedItem } from '../api/types'
import {
  getFeedEventLine,
  getFeedTeaser,
  getFeedTopic,
  getPrimaryPassageVote,
  isProceduralFeedItem,
} from './feedRowLabels'

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    bill: { congress: 119, type: 'HR', number: 2913, title: 'Sample bill title' },
    policy_area: 'Defense',
    digest: null,
    raw_summary_text: null,
    passage_votes: [],
    latest_passage_date: '2026-06-05',
    ...overrides,
  }
}

describe('getFeedEventLine', () => {
  it('formats substantive pass event lines', () => {
    const item = makeItem({
      bill: { congress: 119, type: 'HR', number: 2913, title: 'Authorize support for Ukraine' },
      passage_votes: [
        {
          chamber: 'Senate',
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 52,
          nays: 47,
          date: '2026-06-05',
        },
      ],
    })

    expect(getFeedEventLine(item)).toBe('Passed · Senate · 52–47 · H.R. 2913')
  })

  it('formats substantive fail event lines', () => {
    const item = makeItem({
      bill: { congress: 119, type: 'HR', number: 8428, title: 'Rural hospital funding' },
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Passage of the Bill',
          result: 'Failed',
          yeas: 198,
          nays: 230,
          date: '2026-06-04',
        },
      ],
    })

    expect(getFeedEventLine(item)).toBe('Failed · House · 198–230 · H.R. 8428')
  })

  it('formats procedural agreed event lines with framing B', () => {
    const item = makeItem({
      bill: {
        congress: 119,
        type: 'HRES',
        number: 512,
        title:
          'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.',
      },
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Agreeing to the Resolution',
          result: 'Agreed to',
          yeas: 218,
          nays: 210,
          date: '2026-06-04',
        },
      ],
    })

    expect(getFeedEventLine(item)).toBe(
      'Procedural · House agreed 218–210 · debate rule for H.R. 2913',
    )
  })

  it('formats procedural rejected event lines with framing B', () => {
    const item = makeItem({
      bill: {
        congress: 119,
        type: 'HR',
        number: 456,
        title:
          'Waiving a requirement of clause 6(a) of rule XIII with respect to consideration of certain resolutions reported from the Committee on Rules.',
      },
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Agreeing to the Resolution',
          result: 'Rejected',
          yeas: 198,
          nays: 230,
          date: '2026-06-04',
        },
      ],
    })

    expect(getFeedEventLine(item)).toBe('Procedural · House rejected 198–230 · rule for H.R. 456')
  })
})

describe('isProceduralFeedItem', () => {
  it('classifies procedural items with a digest as procedural', () => {
    const item = makeItem({
      bill: {
        congress: 119,
        type: 'HRES',
        number: 512,
        title:
          'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.',
      },
      digest: {
        headline: 'Ukraine security assistance',
        what_it_does: 'Sets floor debate terms for the underlying bill.',
        key_points: [],
        terms_explained: [],
      },
    })

    expect(isProceduralFeedItem(item)).toBe(true)
    expect(getFeedTopic(item)).toBe('Ukraine security assistance')
  })
})

describe('getPrimaryPassageVote', () => {
  it('returns the vote with the latest date when multiple votes exist', () => {
    const older = {
      chamber: 'House' as const,
      question: 'On Passage of the Bill',
      result: 'Passed',
      yeas: 220,
      nays: 210,
      date: '2026-01-15',
    }
    const newer = {
      chamber: 'Senate' as const,
      question: 'On Passage of the Bill',
      result: 'Passed',
      yeas: 52,
      nays: 47,
      date: '2026-06-05',
    }

    expect(getPrimaryPassageVote(makeItem({ passage_votes: [older, newer] }))).toBe(newer)
    expect(getPrimaryPassageVote(makeItem({ passage_votes: [newer, older] }))).toBe(newer)
  })
})

describe('getFeedTeaser', () => {
  it('returns null when there is no digest', () => {
    expect(getFeedTeaser(makeItem())).toBeNull()
  })

  it('caps teaser text at roughly 120 characters on a word boundary', () => {
    const item = makeItem({
      digest: {
        headline: 'Sample headline',
        what_it_does:
          'This bill provides support to Ukraine and allied countries through security assistance, financing, and oversight requirements for federal agencies.',
        key_points: [],
        terms_explained: [],
      },
    })

    const teaser = getFeedTeaser(item)
    expect(teaser).not.toBeNull()
    expect(teaser!.length).toBeLessThanOrEqual(120)
    expect(teaser).toMatch(/…$/)
    expect(teaser).not.toMatch(/\s…$/)
  })
})

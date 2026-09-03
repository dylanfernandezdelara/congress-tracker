import { describe, expect, it } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import { feedItemTextGrew, hasAddedProvisions } from './textGrew'

describe('hasAddedProvisions', () => {
  it('is true only when added_provisions is non-empty', () => {
    expect(hasAddedProvisions(undefined)).toBe(false)
    expect(hasAddedProvisions({ added_provisions: [] })).toBe(false)
    expect(
      hasAddedProvisions({
        added_provisions: [{ label: '3.', heading: 'Photo identification' }],
      }),
    ).toBe(true)
  })
})

describe('feedItemTextGrew', () => {
  it('reads text_changes on a feed item', () => {
    expect(feedItemTextGrew(makeFeedItem())).toBe(false)
    expect(
      feedItemTextGrew(
        makeFeedItem({
          text_changes: {
            summary_version: 'Reported in House',
            summary_version_date: '2026-02-03',
            latest_version: 'Engrossed in House',
            latest_version_date: '2026-07-22',
            added_provisions: [{ label: '3.', heading: 'Photo identification' }],
            more_added_count: 0,
          },
        }),
      ),
    ).toBe(true)
  })
})

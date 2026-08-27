import type { FeedItem } from '../api/types'

export function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  const item: FeedItem = {
    bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
    policy_area: 'Defense',
    digest: {
      headline: 'Plain headline for readers',
      what_it_does: 'It does something important in plain language.',
      key_points: ['Point one'],
      terms_explained: [],
    },
    raw_summary_text: 'Official CRS summary text.',
    passage_votes: [
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
    latest_passage_date: '2026-06-05',
    latest_activity_date: '2026-06-05',
    lifecycle: null,
    ...overrides,
  }

  // Callers often override only latest_passage_date; keep activity and the
  // primary roll date aligned unless set.
  if (
    overrides.latest_activity_date === undefined &&
    overrides.latest_passage_date !== undefined &&
    overrides.latest_passage_date !== null
  ) {
    item.latest_activity_date = overrides.latest_passage_date
  }
  if (
    overrides.passage_votes === undefined &&
    overrides.latest_passage_date !== undefined &&
    overrides.latest_passage_date !== null &&
    item.passage_votes[0]
  ) {
    item.passage_votes = [
      { ...item.passage_votes[0], date: overrides.latest_passage_date },
    ]
  }

  return item
}

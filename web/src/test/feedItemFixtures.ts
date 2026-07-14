import type { FeedItem } from '../api/types'

export function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
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
    lifecycle: null,
    ...overrides,
  }
}

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Home from './Home'

vi.mock('../api/client', () => ({
  fetchFeed: vi.fn().mockResolvedValue([
    {
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
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 52,
          nays: 47,
          date: '2026-06-05',
        },
      ],
      latest_passage_date: '2026-06-05',
    },
  ]),
  fetchSessionStats: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    as_of: '2026-06-14T00:00:00.000Z',
    house: {
      passage_vote_count: 3,
      unique_bills_passed: 3,
      avg_margin: 50,
      closest_margin: 7,
      date_range: { first: '2026-06-01', last: '2026-06-10' },
      coverage_days: 10,
    },
    senate: {
      passage_vote_count: 1,
      unique_bills_passed: 1,
      avg_margin: 5,
      closest_margin: 5,
      date_range: { first: '2026-06-05', last: '2026-06-05' },
      coverage_days: 1,
    },
  }),
  fetchPulseStats: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    as_of: '2026-06-14T00:00:00.000Z',
    house: {
      close_votes: [],
      policy_heat: [],
      this_week: { count: 0, headline: null, bill_type: null, bill_number: null, congress: null },
    },
    senate: {
      close_votes: [],
      policy_heat: [],
      this_week: { count: 0, headline: null, bill_type: null, bill_number: null, congress: null },
    },
  }),
  fetchDefectors: vi.fn().mockResolvedValue({
    chamber: 'House',
    congress: 119,
    session: 2,
    defectors: [],
    as_of: '2026-06-14T00:00:00.000Z',
  }),
  fetchPortfolioStats: vi.fn().mockResolvedValue({
    chamber: 'House',
    congress: 119,
    session: 2,
    gainers: [],
    losers: [],
    disclaimer: 'Estimates from public disclosures.',
    as_of: '2026-06-14T00:00:00.000Z',
  }),
}))

describe('Home', () => {
  it('renders the feed with a digestible headline', async () => {
    render(<Home />)
    expect(screen.getByRole('heading', { name: 'What is Congress Doing?' })).toBeInTheDocument()
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('52–47')).toBeInTheDocument()
  })
})

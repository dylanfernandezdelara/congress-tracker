import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('./api/client', () => ({
  fetchFeed: vi.fn().mockResolvedValue({
    items: [
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
        passage_votes: [],
        // No passage votes loaded — passage date is null; activity still drives chronology.
        latest_passage_date: null,
        latest_activity_date: '2026-06-05',
      },
    ],
    total: 1,
    limit: 50,
    offset: 0,
    has_more: false,
  }),
  fetchSessionStats: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    as_of: '2026-06-14T00:00:00.000Z',
    house: {
      passage_vote_count: 0,
      unique_bills_passed: 0,
      avg_margin: 0,
      closest_margin: 0,
      date_range: { first: null, last: null },
      coverage_days: 0,
    },
    senate: {
      passage_vote_count: 0,
      unique_bills_passed: 0,
      avg_margin: 0,
      closest_margin: 0,
      date_range: { first: null, last: null },
      coverage_days: 0,
    },
    composition: {
      house: {
        seats: [],
        total: 0,
        majority_party: null,
        control_label: 'No data',
        seats_up_for_election: 435,
        election_year: 2026,
      },
      senate: {
        seats: [],
        total: 0,
        majority_party: null,
        control_label: 'No data',
        seats_up_for_election: 33,
        election_year: 2026,
      },
    },
  }),
  fetchNotableVotes: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    detection_method: 'heuristic',
    as_of: '2026-06-14T00:00:00.000Z',
    notable: [],
  }),
  fetchRecentLaws: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    as_of: '2026-06-14T00:00:00.000Z',
    laws: [],
  }),
  fetchRecentConfirmations: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    as_of: '2026-06-14T00:00:00.000Z',
    confirmations: [],
  }),
  fetchCommitteesLeaderboard: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    chamber: 'House',
    as_of: '2026-06-14T00:00:00.000Z',
    items: [],
  }),
  fetchPulseStats: vi.fn().mockResolvedValue({
    house: {
      close_votes: [],
      policy_heat: [],
      this_week: { count: 0, headline: null },
    },
    senate: {
      close_votes: [],
      policy_heat: [],
      this_week: { count: 0, headline: null },
    },
  }),
  fetchDefectors: vi.fn().mockResolvedValue({ defectors: [] }),
  fetchPolicyAreas: vi.fn().mockResolvedValue({ items: [] }),
  fetchMembersSearch: vi.fn().mockResolvedValue({ items: [], q: '', limit: 8 }),
  fetchPortfolioStats: vi.fn().mockResolvedValue({
    gainers: [],
    losers: [],
    disclaimer: 'Estimates from public disclosures.',
  }),
}))

describe('App routing', () => {
  it('redirects unknown paths to the feed', async () => {
    window.history.pushState({}, '', '/unknown-path')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Track Congress' })).toBeInTheDocument()
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(await screen.findAllByText('No close votes yet this session.')).toHaveLength(2)
  })
})

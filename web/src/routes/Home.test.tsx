import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppLayout } from '../layouts/AppLayout'
import Home from './Home'

vi.mock('../api/client', () => ({
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
    ],
    total: 1,
    limit: 15,
    offset: 0,
    has_more: false,
  }),
  fetchNotableVotes: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    detection_method: 'heuristic',
    as_of: '2026-06-14T00:00:00.000Z',
    notable: [
      {
        chamber: 'Senate',
        congress: 119,
        session: 2,
        roll_number: 9002,
        bill_type: 's',
        bill_number: 47,
        yeas: 68,
        nays: 32,
        margin: 36,
        vote_date: '2026-06-05',
        headline: 'Notable vote headline for sidebar',
        significance_score: 42,
        why_it_matters: 'Bipartisan coalition carried the vote',
        defectors: [],
        member_votes_available: false,
      },
    ],
  }),
  fetchSessionStats: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    as_of: '2026-06-14T00:00:00.000Z',
    composition: {
      house: {
        total: 435,
        majority_party: 'R',
        control_label: 'Republican control',
        is_sample: false,
        seats_up_for_election: 435,
        election_year: 2026,
        seats: [
          { party: 'R', seats: 218 },
          { party: 'D', seats: 212 },
          { party: 'I', seats: 1 },
        ],
      },
      senate: {
        total: 100,
        majority_party: 'R',
        control_label: 'Republican control',
        is_sample: false,
        seats_up_for_election: 33,
        election_year: 2026,
        seats: [
          { party: 'R', seats: 53 },
          { party: 'D', seats: 45 },
          { party: 'I', seats: 2 },
        ],
      },
    },
    house: {
      passage_vote_count: 10,
      unique_bills_passed: 8,
      avg_margin: 12,
      closest_margin: 2,
      date_range: { first: '2026-01-01', last: '2026-06-05' },
      coverage_days: 120,
    },
    senate: {
      passage_vote_count: 5,
      unique_bills_passed: 4,
      avg_margin: 10,
      closest_margin: 1,
      date_range: { first: '2026-01-01', last: '2026-06-05' },
      coverage_days: 120,
    },
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
  fetchPortfolioStats: vi.fn().mockResolvedValue({
    gainers: [],
    losers: [],
    disclaimer: 'Estimates from public disclosures.',
  }),
}))

function renderFeed() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Home', () => {
  it('renders the dense feed with rails and no flip hints', async () => {
    const { container } = renderFeed()
    expect(screen.getByRole('heading', { name: 'Congress Tracker' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Site sections' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Plain headline for readers' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Congressional passage votes' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Federal Control' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Notable votes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Members in Congress')).toBeInTheDocument()
    expect(screen.getByLabelText('Legislative pulse')).toBeInTheDocument()
    expect(screen.getAllByText('No close votes yet this session.')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Chronological timeline' })).toBeInTheDocument()

    const feedList = container.querySelector('.feed-list')
    expect(feedList).not.toBeNull()
    expect(feedList?.tagName).toBe('UL')
    expect(within(feedList as HTMLElement).getByText('Passed')).toBeInTheDocument()
    expect(screen.queryByText('Flip for vote details ↺')).not.toBeInTheDocument()
    expect(container.querySelector('.feed-row')).not.toBeNull()
  })
})

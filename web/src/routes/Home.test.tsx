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
    limit: 50,
    offset: 0,
    has_more: false,
  }),
  fetchSessionStats: vi.fn().mockResolvedValue({
    congress: 119,
    session: 2,
    as_of: '2026-06-14T00:00:00.000Z',
    house: {
      passage_vote_count: 2,
      unique_bills_passed: 2,
      avg_margin: 12,
      closest_margin: 5,
      date_range: { first: '2026-06-01', last: '2026-06-05' },
      coverage_days: 5,
    },
    senate: {
      passage_vote_count: 1,
      unique_bills_passed: 1,
      avg_margin: 5,
      closest_margin: 5,
      date_range: { first: '2026-06-05', last: '2026-06-05' },
      coverage_days: 1,
    },
    composition: {
      house: {
        seats: [
          { party: 'R', seats: 220 },
          { party: 'D', seats: 215 },
        ],
        total: 435,
        majority_party: 'R',
        control_label: 'Republican control',
        seats_up_for_election: 435,
        election_year: 2026,
      },
      senate: {
        seats: [
          { party: 'R', seats: 53 },
          { party: 'D', seats: 47 },
        ],
        total: 100,
        majority_party: 'R',
        control_label: 'Republican control',
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
      },
    ],
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
  it('renders the feed as a list with visible outcomes and no flip hints', async () => {
    const { container } = renderFeed()
    expect(screen.getByRole('heading', { name: 'Congress Tracker' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Site sections' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'Plain headline for readers' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Chamber control' })).toBeInTheDocument()
    expect(screen.getAllByText('Republican control').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText('House party seat counts')).toBeInTheDocument()
    expect(screen.getByLabelText('Senate party seat counts')).toBeInTheDocument()
    expect(screen.getByText('220')).toBeInTheDocument()
    expect(screen.getByText('53')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Notable votes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chronological timeline' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Members in Congress')).not.toBeInTheDocument()

    const feedList = container.querySelector('.feed-list')
    expect(feedList).not.toBeNull()
    expect(feedList?.tagName).toBe('UL')
    expect(within(feedList as HTMLElement).getByText('Passed')).toBeInTheDocument()
    expect(screen.queryByText('Flip for vote details ↺')).not.toBeInTheDocument()
    expect(container.querySelector('.feed-row')).not.toBeNull()
  })
})

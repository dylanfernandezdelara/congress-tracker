import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppLayout } from '../layouts/AppLayout'
import StatsPage from './StatsPage'

vi.mock('../api/client', () => ({
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
    composition: {
      house: {
        seats: [{ party: 'R', seats: 220 }, { party: 'D', seats: 215 }],
        total: 435,
        majority_party: 'R',
        control_label: 'Republican control',
        seats_up_for_election: 435,
        election_year: 2026,
      },
      senate: {
        seats: [{ party: 'R', seats: 53 }, { party: 'D', seats: 47 }],
        total: 100,
        majority_party: 'R',
        control_label: 'Republican control',
        seats_up_for_election: 33,
        election_year: 2026,
      },
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

describe('StatsPage', () => {
  it('renders member and pulse sections', async () => {
    render(
      <MemoryRouter initialEntries={['/stats']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/stats" element={<StatsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByLabelText('Members in Congress')).toBeInTheDocument()
    expect(await screen.findByLabelText('Legislative pulse')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Feed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stats' })).toBeInTheDocument()
  })
})

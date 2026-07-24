import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearMemberProfileCache } from '../api/memberProfileCache'
import type { DefectorEntry, PortfolioMovers, SessionStatsResponse } from '../api/types'
import type { UseAsyncDataResult } from '../hooks/useAsyncData'
import type { ChamberPair } from '../hooks/useStatsData'
import { LeftSidebar } from './LeftSidebar'

vi.mock('../api/client', () => ({
  fetchMemberProfile: vi.fn(async () => ({
    bioguide_id: 'F000466',
    name: 'Brian Fitzpatrick',
    chamber: 'House',
    party: 'R',
    state: 'PA',
    district: 1,
    photo_url: 'https://example.com/fitz.jpg',
    congress_gov_url: 'https://www.congress.gov/member/f000466',
    congress: 119,
    session: 2,
    votes_cast: 20,
    yea_count: 12,
    nay_count: 8,
    cross_vote_count: 5,
    cross_vote_label: 'occasional',
    recent_cross_votes: [],
    member_votes_available: true,
    as_of: '2026-07-20T00:00:00.000Z',
  })),
}))

function asyncResult<T>(data: T | null, overrides: Partial<UseAsyncDataResult<T>> = {}): UseAsyncDataResult<T> {
  return {
    data,
    error: null,
    isLoading: false,
    ...overrides,
  }
}

function chamberPair<T>(house: T, senate: T): ChamberPair<T> {
  return {
    house,
    senate,
    houseError: null,
    senateError: null,
  }
}

const session = asyncResult<SessionStatsResponse>({
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
        { party: 'D', seats: 217 },
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
        { party: 'D', seats: 47 },
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
})

const houseDefector: DefectorEntry = {
  bioguide_id: 'F000466',
  name: 'Brian Fitzpatrick',
  party: 'R',
  state: 'PA',
  cross_vote_count: 5,
  deciding_score: 2,
  congress_gov_url: 'https://www.congress.gov/member/f000466',
}

const emptyPortfolios: PortfolioMovers = {
  gainers: [],
  losers: [],
  disclaimer: 'Estimates from public disclosures.',
}

describe('LeftSidebar', () => {
  afterEach(() => {
    vi.clearAllMocks()
    clearMemberProfileCache()
    document.body.style.overflow = ''
  })

  it('opens the in-app member profile when a spotlight name is clicked', async () => {
    const defectors = asyncResult(chamberPair([houseDefector], [] as DefectorEntry[]))
    const portfolios = asyncResult(chamberPair(emptyPortfolios, emptyPortfolios))

    render(
      <LeftSidebar session={session} defectors={defectors} portfolios={portfolios} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open profile for Brian Fitzpatrick' }))

    expect(screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'View on Congress.gov' })).toBeInTheDocument()
  })

  it('falls back to an external link when bioguide id is missing', () => {
    const defectors = asyncResult(
      chamberPair(
        [
          {
            ...houseDefector,
            bioguide_id: '   ',
            name: 'No Id Member',
          },
        ],
        [] as DefectorEntry[],
      ),
    )
    const portfolios = asyncResult(chamberPair(emptyPortfolios, emptyPortfolios))

    render(
      <LeftSidebar session={session} defectors={defectors} portfolios={portfolios} />,
    )

    const link = screen.getByRole('link', { name: 'No Id Member' })
    expect(link).toHaveAttribute('href', 'https://www.congress.gov/member/f000466')
    expect(
      screen.queryByRole('button', { name: 'Open profile for No Id Member' }),
    ).not.toBeInTheDocument()
  })
})

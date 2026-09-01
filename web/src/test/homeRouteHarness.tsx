import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import type { Mock } from 'vitest'

import { AppLayout } from '../layouts/AppLayout'
import Home from '../routes/Home'
import { makeFeedItem } from './feedItemFixtures'

function SearchParamsProbe() {
  const [params] = useSearchParams()
  return <div data-testid="search-params">{params.toString()}</div>
}

export type HomeApiMocks = {
  fetchFeed: Mock
  fetchNotableVotes: Mock
  fetchRecentLaws: Mock
  fetchRecentConfirmations: Mock
  fetchCommitteesLeaderboard: Mock
  fetchDefectors: Mock
  fetchMemberProfile: Mock
  fetchMembersSearch: Mock
  fetchPolicyAreas: Mock
  fetchSessionStats: Mock
  fetchPulseStats: Mock
  fetchPortfolioStats: Mock
}

export function mockViewport(isDesktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches:
      (isDesktop &&
        (query.includes('min-width: 1024px') || query.includes('min-width: 640px'))) ||
      (!isDesktop && query.includes('prefers-reduced-motion')),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

export function renderHome(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]} future={routerFuture}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="/"
            element={
              <>
                <SearchParamsProbe />
                <Home />
              </>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

export function pageResponse(
  items: ReturnType<typeof makeFeedItem>[],
  overrides: Partial<{ total: number; has_more: boolean; offset: number }> = {},
) {
  return {
    items,
    total: overrides.total ?? items.length,
    limit: 15,
    offset: overrides.offset ?? 0,
    has_more: overrides.has_more ?? false,
  }
}

export function stubHomeRouteDefaults(
  api: HomeApiMocks,
  sessionLast: { house?: string; senate?: string } = {},
) {
  const houseLast = sessionLast.house ?? '2026-06-05'
  const senateLast = sessionLast.senate ?? '2026-06-05'
  api.fetchPolicyAreas.mockResolvedValue({
    items: ['Energy', 'Public Lands and Natural Resources'],
  })
  api.fetchMembersSearch.mockResolvedValue({ items: [], q: '', limit: 8 })
  api.fetchFeed.mockResolvedValue(
    pageResponse([
      makeFeedItem({
        bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
      }),
    ]),
  )
  api.fetchNotableVotes.mockResolvedValue({
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
        bill_type: 'S',
        bill_number: 2,
        yeas: 68,
        nays: 32,
        margin: 36,
        vote_date: '2026-06-05',
        headline: 'Notable vote headline for sidebar',
        what_it_does: 'It does something important in plain language.',
        key_points: ['Point one'],
        raw_summary_text: null,
        significance_score: 42,
        why_it_matters: 'Bipartisan coalition carried the vote',
        defectors: [],
        member_votes_available: false,
      },
    ],
  })
  api.fetchRecentLaws.mockResolvedValue({
    congress: 119,
    session: 2,
    as_of: '2026-06-14T00:00:00.000Z',
    laws: [
      {
        congress: 119,
        bill_type: 'S',
        bill_number: 2,
        title: 'Sample Act',
        policy_area: 'Energy',
        headline: 'Sample law headline',
        became_law_date: '2026-06-10',
        law_kind: 'signed',
        public_law: '119-5',
        signed_date: '2026-06-10',
        presented_date: '2026-06-05',
        latest_action_date: '2026-06-10',
        latest_action_text: 'Became Public Law No: 119-5.',
        latest_passage_vote_date: '2026-06-05',
        item: null,
      },
    ],
  })
  api.fetchRecentConfirmations.mockResolvedValue({
    congress: 119,
    session: 2,
    as_of: '2026-06-14T00:00:00.000Z',
    confirmations: [
      {
        chamber: 'Senate',
        congress: 119,
        session: 2,
        roll_number: 165,
        citation: 'PN100',
        nomination_number: 100,
        part_number: 0,
        nominee_names: [{ display_name: 'Jane Doe', state: 'CA' }],
        position_title: 'Secretary of Energy',
        organization: 'Department of Energy',
        description: 'Jane Doe, of California, to be Secretary of Energy.',
        question: 'On the Nomination',
        result: 'Confirmed',
        yeas: 58,
        nays: 40,
        vote_date: '2026-06-12',
        headline: 'Jane Doe confirmed as Energy Secretary',
        what_was_confirmed: 'The Senate confirmed Jane Doe as Secretary of Energy.',
        background:
          'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
        key_points: [],
        congress_gov_url: 'https://www.congress.gov/nomination/119th-congress/100',
        wikipedia_url: null,
        wikipedia_extract: null,
        party_splits: [
          { party: 'R', yeas: 53, nays: 0, party_line: 'yea' },
          { party: 'D', yeas: 5, nays: 40, party_line: 'nay' },
        ],
      },
    ],
  })
  api.fetchCommitteesLeaderboard.mockResolvedValue({
    congress: 119,
    session: 2,
    chamber: 'House',
    as_of: '2026-06-14T00:00:00.000Z',
    items: [],
  })
  api.fetchSessionStats.mockResolvedValue({
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
      date_range: { first: '2026-01-01', last: houseLast },
      coverage_days: 120,
    },
    senate: {
      passage_vote_count: 5,
      unique_bills_passed: 4,
      avg_margin: 10,
      closest_margin: 1,
      date_range: { first: '2026-01-01', last: senateLast },
      coverage_days: 120,
    },
  })
  api.fetchPulseStats.mockResolvedValue({
    house: {
      close_votes: [],
      policy_heat: [],
      this_week: { count: 0, headline: null, bill_type: null, bill_number: null, congress: null },
      waiting_in_committee: [
        {
          system_code: 'hsif00',
          name: 'Energy and Commerce',
          chamber: 'House',
          waiting: 2,
        },
      ],
    },
    senate: {
      close_votes: [],
      policy_heat: [],
      this_week: { count: 0, headline: null, bill_type: null, bill_number: null, congress: null },
      waiting_in_committee: [
        {
          system_code: 'sshr00',
          name: 'HELP',
          chamber: 'Senate',
          waiting: 1,
        },
      ],
    },
  })
  api.fetchPortfolioStats.mockResolvedValue({
    gainers: [],
    losers: [],
    disclaimer: 'Estimates from public disclosures.',
  })
  api.fetchDefectors.mockImplementation(async (chamber: 'House' | 'Senate') => ({
    defectors:
      chamber === 'House'
        ? [
            {
              bioguide_id: 'F000466',
              name: 'Brian Fitzpatrick',
              party: 'R',
              state: 'PA',
              cross_vote_count: 5,
              deciding_score: 2,
              congress_gov_url: 'https://www.congress.gov/member/brian-fitzpatrick/F000466',
            },
          ]
        : [],
  }))
  api.fetchMemberProfile.mockResolvedValue({
    bioguide_id: 'F000466',
    name: 'Brian Fitzpatrick',
    chamber: 'House',
    party: 'R',
    state: 'PA',
    district: 1,
    photo_url: 'https://example.com/fitz.jpg',
    congress_gov_url: 'https://www.congress.gov/member/brian-fitzpatrick/F000466',
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
  })
  mockViewport(true)
}

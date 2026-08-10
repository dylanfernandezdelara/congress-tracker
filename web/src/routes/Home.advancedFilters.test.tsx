import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearMemberProfileCache } from '../api/memberProfileCache'
import { resetSheetLayerForTests } from '../utils/sheetLayer'
import { makeFeedItem } from '../test/feedItemFixtures'
import { AppLayout } from '../layouts/AppLayout'
import Home from './Home'

function SearchParamsProbe() {
  const [params] = useSearchParams()
  return <div data-testid="search-params">{params.toString()}</div>
}

const {
  fetchFeed,
  fetchNotableVotes,
  fetchRecentLaws,
  fetchRecentConfirmations,
  fetchDefectors,
  fetchMemberProfile,
  fetchMembersSearch,
  fetchPolicyAreas,
  fetchSessionStats,
  fetchPulseStats,
  fetchPortfolioStats,
} = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  fetchNotableVotes: vi.fn(),
  fetchRecentLaws: vi.fn(),
  fetchRecentConfirmations: vi.fn(),
  fetchDefectors: vi.fn(),
  fetchMemberProfile: vi.fn(),
  fetchMembersSearch: vi.fn(),
  fetchPolicyAreas: vi.fn(),
  fetchSessionStats: vi.fn(),
  fetchPulseStats: vi.fn(),
  fetchPortfolioStats: vi.fn(),
}))

vi.mock('../api/client', () => ({
  fetchFeed,
  fetchNotableVotes,
  fetchRecentLaws,
  fetchRecentConfirmations,
  fetchSessionStats,
  fetchPulseStats,
  fetchDefectors,
  fetchPortfolioStats,
  fetchMemberProfile,
  fetchMembersSearch,
  fetchPolicyAreas,
}))

function mockViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
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
  }))
}

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

function renderHome(initialEntry = '/') {
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

function pageResponse(
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

describe('Home advanced filters', () => {
  beforeEach(() => {
    fetchPolicyAreas.mockResolvedValue({ items: ['Energy', 'Public Lands and Natural Resources'] })
    fetchMembersSearch.mockResolvedValue({ items: [], q: '', limit: 8 })
    fetchFeed.mockResolvedValue(
      pageResponse([
        makeFeedItem({
          bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
        }),
      ]),
    )
    fetchNotableVotes.mockResolvedValue({
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
    fetchRecentLaws.mockResolvedValue({
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
    fetchRecentConfirmations.mockResolvedValue({
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
    fetchSessionStats.mockResolvedValue({
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
    })
    fetchPulseStats.mockResolvedValue({
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
    })
    fetchPortfolioStats.mockResolvedValue({
      gainers: [],
      losers: [],
      disclaimer: 'Estimates from public disclosures.',
    })
    fetchDefectors.mockImplementation(async (chamber: 'House' | 'Senate') => ({
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
    fetchMemberProfile.mockResolvedValue({
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
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    clearMemberProfileCache()
    resetSheetLayerForTests()
    document.body.style.overflow = ''
  })

  it('filters the feed by sponsor state, resets the list, and updates the URL', async () => {
    const nyItem = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 1, title: 'NY-sponsored bill' },
      digest: {
        headline: 'New York sponsor headline',
        what_it_does: 'NY summary',
        key_points: ['Point'],
        terms_explained: [],
      },
    })
    const otherItem = makeFeedItem({
      bill: { congress: 119, type: 'S', number: 47, title: 'TX-sponsored bill' },
      digest: {
        headline: 'Texas sponsor headline',
        what_it_does: 'TX summary',
        key_points: ['Point'],
        terms_explained: [],
      },
    })

    fetchFeed
      .mockResolvedValueOnce(pageResponse([nyItem, otherItem], { total: 2 }))
      .mockResolvedValueOnce(pageResponse([nyItem], { total: 1 }))

    renderHome()

    expect(await screen.findByText('New York sponsor headline')).toBeInTheDocument()
    expect(screen.getByText('Texas sponsor headline')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.change(screen.getByLabelText('Filter by sponsor state'), {
      target: { value: 'NY' },
    })

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0, state: 'NY' })
    })
    expect(await screen.findByText('New York sponsor headline')).toBeInTheDocument()
    expect(screen.queryByText('Texas sponsor headline')).not.toBeInTheDocument()
    expect(screen.getByText(/1 of 1 passage vote/)).toBeInTheDocument()
    expect(screen.getByText(/1 of 1 passage vote · New York/)).toBeInTheDocument()
    expect(screen.getByTestId('search-params')).toHaveTextContent('state=NY')
    expect(screen.getByLabelText('Filter by sponsor state')).toHaveValue('NY')
  })

  it('filters by sponsor chamber, party, member name, and topic together', async () => {
    fetchMembersSearch.mockResolvedValue({
      items: [
        {
          bioguide_id: 'LOCAL:H002',
          name: 'Rep. Sample Loyal (local)',
          chamber: 'House',
          party: 'D',
          state: 'NY',
          district: 10,
        },
      ],
      q: 'Loyal',
      limit: 8,
    })
    fetchMemberProfile.mockResolvedValue({
      bioguide_id: 'LOCAL:H002',
      name: 'Rep. Sample Loyal (local)',
      chamber: 'House',
      party: 'D',
      state: 'NY',
      district: 10,
      photo_url: '',
      congress_gov_url: null,
      congress: 119,
      session: 2,
      votes_cast: 1,
      yea_count: 1,
      nay_count: 0,
      cross_vote_count: 0,
      cross_vote_label: 'cross-party votes',
      recent_cross_votes: [],
      member_votes_available: true,
      as_of: '2026-08-07T00:00:00.000Z',
    })

    fetchFeed
      .mockResolvedValueOnce(pageResponse([makeFeedItem()], { total: 1 }))
      .mockResolvedValue(pageResponse([makeFeedItem()], { total: 1 }))

    renderHome()
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Sponsor chamber' })).getByRole('radio', {
        name: 'House',
      }),
    )

    fireEvent.change(screen.getByLabelText('Filter by sponsor party'), {
      target: { value: 'D' },
    })
    fireEvent.change(screen.getByLabelText('Filter by policy topic'), {
      target: { value: 'Energy' },
    })

    const memberInput = screen.getByPlaceholderText('Name or last name')
    fireEvent.change(memberInput, { target: { value: 'Loyal' } })
    expect(await screen.findByRole('option', { name: /Rep\. Sample Loyal/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Rep\. Sample Loyal/ }))

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({
        limit: 15,
        offset: 0,
        sponsorChamber: 'House',
        party: 'D',
        policy: 'Energy',
        sponsor: 'LOCAL:H002',
      })
    })
    expect(screen.getByTestId('search-params').textContent).toContain('sponsor_chamber=House')
    expect(screen.getByTestId('search-params').textContent).toContain('party=D')
    expect(screen.getByTestId('search-params').textContent).toContain('policy=Energy')
    expect(screen.getByTestId('search-params').textContent).toContain('sponsor=LOCAL%3AH002')
  })

  it('shows a sponsor-filter empty state with a clear action', async () => {
    fetchFeed.mockResolvedValue(pageResponse([], { total: 0 }))
    renderHome('/?state=NY&sponsor_chamber=Senate')

    expect(
      await screen.findByText(
        'No passage votes matching New York · Senate sponsors in the last 45 days.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0 })
    })
  })

  it('treats invalid state query values as All states', async () => {
    renderHome('/?state=New%20York')
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(fetchFeed).toHaveBeenCalledWith({ limit: 15, offset: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByLabelText('Filter by sponsor state')).toHaveValue('')
  })

  it('opens filters in a bottom sheet on narrow viewports and Escape clears member draft first', async () => {
    mockViewport(false)
    renderHome()
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeInTheDocument()

    const memberInput = within(dialog).getByPlaceholderText('Name or last name')
    fireEvent.change(memberInput, { target: { value: 'Schumer' } })
    fireEvent.keyDown(memberInput, { key: 'Escape' })

    expect(memberInput).toHaveValue('')
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
  })

  it('shows removable chips for active advanced filters', async () => {
    renderHome('/?state=NY&sponsor_chamber=House')
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove New York filter' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove House sponsors filter' }))
    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0, state: 'NY' })
    })
  })

})

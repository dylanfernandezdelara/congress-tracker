import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
}))

function mockViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      (isDesktop && query.includes('min-width: 1024px')) ||
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

describe('Home', () => {
  beforeEach(() => {
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

  it('renders the dense feed with rails and no flip hints', async () => {
    const { container } = renderHome()
    expect(screen.getByRole('heading', { name: 'Track Congress' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Site sections' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Plain headline for readers' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Congressional passage votes' })).not.toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Federal Control' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Notable votes' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'New laws' })).toBeInTheDocument()
    expect(screen.getByLabelText('Members in Congress')).toBeInTheDocument()
    expect(screen.getByLabelText('Legislative pulse')).toBeInTheDocument()
    expect(await screen.findAllByText('No close votes yet this session.')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Chronological timeline' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent confirmations' })).toBeInTheDocument()
    expect(screen.getByText('Jane Doe confirmed as Energy Secretary')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'New laws' })).toBeInTheDocument()
    expect(screen.getByText('Sample law headline')).toBeInTheDocument()
    expect(container.querySelector('.home-mobile-rails')).toBeNull()
    expect(container.querySelector('.home-rail--left')).not.toBeNull()
    expect(container.querySelector('.home-rail--right')).not.toBeNull()

    const feedList = container.querySelector('#feed-top .feed-list')
    expect(feedList).not.toBeNull()
    expect(feedList?.tagName).toBe('UL')
    expect(within(feedList as HTMLElement).getByText('Passed')).toBeInTheDocument()
    expect(screen.queryByText('Flip for vote details ↺')).not.toBeInTheDocument()
    expect(container.querySelector('#feed-top .feed-row')).not.toBeNull()

    // The daily timeline leads; slower-moving confirmations and laws stack below it.
    const feedSection = container.querySelector('#feed-top')
    const secondary = container.querySelector('.home-feed-secondary')
    expect(secondary).not.toBeNull()
    expect(
      feedSection!.compareDocumentPosition(secondary!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      within(secondary as HTMLElement).getByRole('region', { name: 'Recent confirmations' }),
    ).toBeInTheDocument()
    expect(
      within(secondary as HTMLElement).getByRole('region', { name: 'New laws' }),
    ).toBeInTheDocument()
  })

  it('stacks rail content below the feed on narrow viewports without duplicate fetches', async () => {
    mockViewport(false)
    const { container } = renderHome()

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Plain headline for readers' }),
    ).toBeInTheDocument()

    const mobileRails = container.querySelector('.home-mobile-rails')
    expect(mobileRails).not.toBeNull()
    expect(container.querySelector('.home-rail--left')).toBeNull()
    expect(container.querySelector('.home-rail--right')).toBeNull()

    const feedSection = container.querySelector('#feed-top')
    expect(feedSection).not.toBeNull()
    expect(
      feedSection!.compareDocumentPosition(mobileRails!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    // Confirmations and laws follow the feed but come before the context rails.
    const secondary = container.querySelector('.home-feed-secondary')
    expect(secondary).not.toBeNull()
    expect(
      feedSection!.compareDocumentPosition(secondary!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      secondary!.compareDocumentPosition(mobileRails!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    const sections = mobileRails!.querySelectorAll(':scope > .home-mobile-rail-section')
    expect(sections).toHaveLength(4)
    expect(within(sections[0] as HTMLElement).getByRole('region', { name: 'Notable votes' })).toBeInTheDocument()
    expect(sections[1]).toHaveAttribute('aria-label', 'Legislative pulse')
    expect(within(sections[2] as HTMLElement).getByRole('region', { name: 'Federal Control' })).toBeInTheDocument()
    expect(sections[3]).toHaveAttribute('aria-label', 'Members in Congress')

    expect(screen.getAllByRole('region', { name: 'Notable votes' })).toHaveLength(1)
    expect(screen.getAllByRole('region', { name: 'Federal Control' })).toHaveLength(1)
    await waitFor(() => {
      expect(fetchNotableVotes).toHaveBeenCalledTimes(1)
      expect(fetchRecentLaws).toHaveBeenCalledTimes(1)
      expect(fetchDefectors).toHaveBeenCalledTimes(2)
    })
  })

  it('opens a member profile from a left-rail spotlight', async () => {
    mockViewport(true)
    renderHome()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open profile for Brian Fitzpatrick' }),
    )

    expect(screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMemberProfile).toHaveBeenCalled()
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
  })

  it('filters the feed by chamber, resets the list, and updates the URL', async () => {
    const senateItem = makeFeedItem({
      bill: { congress: 119, type: 'S', number: 2, title: 'Senate bill' },
      digest: {
        headline: 'Senate headline',
        what_it_does: 'Senate summary',
        key_points: ['Point'],
        terms_explained: [],
      },
    })
    const houseItem = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 1, title: 'House bill' },
      digest: {
        headline: 'House headline',
        what_it_does: 'House summary',
        key_points: ['Point'],
        terms_explained: [],
      },
      passage_votes: [
        {
          chamber: 'House',
          congress: 119,
          session: 2,
          roll_number: 1,
          question: 'On Passage',
          result: 'Passed',
          yeas: 220,
          nays: 200,
          date: '2026-06-04',
        },
      ],
    })

    fetchFeed
      .mockResolvedValueOnce(pageResponse([senateItem, houseItem], { total: 2 }))
      .mockResolvedValueOnce(pageResponse([houseItem], { total: 1 }))

    renderHome()

    expect(await screen.findByText('Senate headline')).toBeInTheDocument()
    expect(screen.getByText('House headline')).toBeInTheDocument()
    expect(fetchFeed).toHaveBeenCalledWith({ limit: 15, offset: 0 })

    fireEvent.click(screen.getByRole('radio', { name: 'House' }))

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0, chamber: 'House' })
    })
    expect(await screen.findByText('House headline')).toBeInTheDocument()
    expect(screen.queryByText('Senate headline')).not.toBeInTheDocument()
    expect(screen.getByText(/1 of 1 passage vote/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'House' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('search-params')).toHaveTextContent('chamber=House')
  })

  it('treats invalid chamber query values as All', async () => {
    renderHome('/?chamber=Committee')
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(fetchFeed).toHaveBeenCalledWith({ limit: 15, offset: 0 })
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows a chamber-aware empty state with a clear action', async () => {
    fetchFeed.mockResolvedValue(pageResponse([], { total: 0 }))
    renderHome('/?chamber=Senate')

    expect(
      await screen.findByText('No Senate passage votes in the last 45 days.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all chambers' }))

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0 })
    })
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

  it('shows a sponsor-state empty state with a clear action', async () => {
    fetchFeed.mockResolvedValue(pageResponse([], { total: 0 }))
    renderHome('/?state=NY')

    expect(
      await screen.findByText(
        'No passage votes sponsored by New York members in the last 45 days.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear sponsor state' }))

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0 })
    })
  })

  it('treats invalid state query values as All states', async () => {
    renderHome('/?state=New%20York')
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(fetchFeed).toHaveBeenCalledWith({ limit: 15, offset: 0 })
    expect(screen.getByLabelText('Filter by sponsor state')).toHaveValue('')
  })

  it('expands and scrolls to a deep-linked bill, loading further pages if needed', async () => {
    const first = makeFeedItem({
      bill: { congress: 119, type: 'S', number: 2, title: 'First' },
      digest: {
        headline: 'First page bill',
        what_it_does: 'First',
        key_points: ['One'],
        terms_explained: [],
      },
    })
    const second = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 1, title: 'Target' },
      digest: {
        headline: 'Deep linked bill',
        what_it_does: 'Target',
        key_points: ['Two'],
        terms_explained: [],
      },
    })

    fetchFeed
      .mockResolvedValueOnce(pageResponse([first], { total: 2, has_more: true, offset: 0 }))
      .mockResolvedValueOnce(pageResponse([second], { total: 2, has_more: false, offset: 1 }))

    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    renderHome('/?bill=119-hr-1')

    const toggle = await screen.findByRole('button', { name: /Deep linked bill/i })
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
    })
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled()
    })
    expect(fetchFeed).toHaveBeenCalledTimes(2)
  })

  it('shows a dismissible notice when a deep-linked bill is missing', async () => {
    fetchFeed.mockResolvedValue(pageResponse([makeFeedItem()], { total: 1, has_more: false }))
    renderHome('/?bill=119-hr-999')

    expect(
      await screen.findByText('That bill is no longer in the recent feed.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(
      screen.queryByText('That bill is no longer in the recent feed.'),
    ).not.toBeInTheDocument()
  })

  it('writes the expanded bill into the URL and removes it on collapse', async () => {
    renderHome('/?chamber=Senate')
    const toggle = await screen.findByRole('button', { name: /Plain headline for readers/i })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await waitFor(() => {
      const search = screen.getByTestId('search-params').textContent ?? ''
      expect(search).toContain('chamber=Senate')
      expect(search).toContain('bill=119-s-2')
    })

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => {
      expect(screen.getByTestId('search-params')).toHaveTextContent('chamber=Senate')
      expect(screen.getByTestId('search-params').textContent).not.toContain('bill=')
    })
  })

  it('opens an in-place bill sheet from a notable vote without scrolling the feed', async () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    renderHome()

    expect(await screen.findByText('Notable vote headline for sidebar')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open bill details for Notable vote headline for sidebar',
      }),
    )

    expect(
      screen.getByRole('dialog', { name: 'Notable vote headline for sidebar' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('search-params').textContent ?? '').not.toContain('bill=')
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(
      within(screen.getByRole('dialog', { name: 'Notable vote headline for sidebar' })).getByText(
        /It does something important/i,
      ),
    ).toBeInTheDocument()
  })

  it('does not start stats fetches until the first feed page settles', async () => {
    let resolveFeed: (value: unknown) => void = () => {}
    fetchFeed.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFeed = resolve
        }),
    )

    renderHome()

    expect(fetchFeed).toHaveBeenCalledTimes(1)
    expect(fetchSessionStats).not.toHaveBeenCalled()
    expect(fetchPulseStats).not.toHaveBeenCalled()
    expect(fetchDefectors).not.toHaveBeenCalled()
    expect(fetchNotableVotes).not.toHaveBeenCalled()
    expect(fetchRecentLaws).not.toHaveBeenCalled()
    expect(fetchRecentConfirmations).not.toHaveBeenCalled()
    expect(screen.getByText('Loading control…')).toBeInTheDocument()

    resolveFeed(
      pageResponse([
        makeFeedItem({
          bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
        }),
      ]),
    )

    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchSessionStats).toHaveBeenCalled()
      expect(fetchPulseStats).toHaveBeenCalled()
      expect(fetchDefectors).toHaveBeenCalled()
      expect(fetchNotableVotes).toHaveBeenCalled()
      expect(fetchRecentLaws).toHaveBeenCalled()
      expect(fetchRecentConfirmations).toHaveBeenCalled()
    })
  })

  it('still starts stats fetches when the first feed page fails', async () => {
    fetchFeed.mockRejectedValueOnce(new Error('network down'))
    renderHome()

    expect(await screen.findByText("Couldn't load the feed.")).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchSessionStats).toHaveBeenCalled()
      expect(fetchPulseStats).toHaveBeenCalled()
      expect(fetchDefectors).toHaveBeenCalled()
      expect(fetchNotableVotes).toHaveBeenCalled()
      expect(fetchRecentLaws).toHaveBeenCalled()
      expect(fetchRecentConfirmations).toHaveBeenCalled()
    })
    // Gate must not stick closed — session rail content can still render.
    expect(await screen.findByText('Federal Control')).toBeInTheDocument()
  })

  it('keeps rows visible with a busy state while the chamber filter refetches', async () => {
    const senateItem = makeFeedItem({
      bill: { congress: 119, type: 'S', number: 2, title: 'Senate bill' },
      digest: {
        headline: 'Senate headline',
        what_it_does: 'Senate summary',
        key_points: ['Point'],
        terms_explained: [],
      },
    })
    const houseItem = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 1, title: 'House bill' },
      digest: {
        headline: 'House headline',
        what_it_does: 'House summary',
        key_points: ['Point'],
        terms_explained: [],
      },
      passage_votes: [
        {
          chamber: 'House',
          congress: 119,
          session: 2,
          roll_number: 1,
          question: 'On Passage',
          result: 'Passed',
          yeas: 220,
          nays: 200,
          date: '2026-06-04',
        },
      ],
    })

    let resolveHouse: (value: unknown) => void = () => {}
    fetchFeed
      .mockResolvedValueOnce(pageResponse([senateItem, houseItem], { total: 2 }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveHouse = resolve
          }),
      )

    const { container } = renderHome()
    expect(await screen.findByText('Senate headline')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'House' }))
    expect(screen.getByText('Senate headline')).toBeInTheDocument()
    expect(container.querySelector('#feed-top')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.feed-list.is-refreshing')).not.toBeNull()
    expect(container.querySelector('.feed-row-skeleton')).toBeNull()

    resolveHouse(pageResponse([houseItem], { total: 1 }))
    expect(await screen.findByText('House headline')).toBeInTheDocument()
    expect(screen.queryByText('Senate headline')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector('#feed-top')).not.toHaveAttribute('aria-busy')
    })
  })

  it('debounces search input, syncs ?q=, and refetches without flashing the skeleton', async () => {
    const allItem = makeFeedItem({
      digest: {
        headline: 'All bills headline',
        what_it_does: 'Summary',
        key_points: ['Point'],
        terms_explained: [],
      },
    })
    const matchItem = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 1, title: 'Defense Act' },
      digest: {
        headline: 'Defense match',
        what_it_does: 'Summary',
        key_points: ['Point'],
        terms_explained: [],
      },
    })

    fetchFeed
      .mockResolvedValueOnce(pageResponse([allItem], { total: 1 }))
      .mockResolvedValueOnce(pageResponse([matchItem], { total: 1 }))

    const { container } = renderHome()
    expect(await screen.findByText('All bills headline')).toBeInTheDocument()
    expect(fetchFeed).toHaveBeenCalledTimes(1)

    const input = screen.getByRole('searchbox', { name: 'Search bills' })
    vi.useFakeTimers()
    fireEvent.change(input, { target: { value: 'defense' } })
    expect(fetchFeed).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(fetchFeed).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    vi.useRealTimers()

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0, q: 'defense' })
    })
    expect(screen.getByTestId('search-params')).toHaveTextContent('q=defense')
    expect(await screen.findByText('Defense match')).toBeInTheDocument()
    expect(container.querySelector('.feed-row-skeleton')).toBeNull()
  })

  it('refetches immediately on Enter and clear', async () => {
    fetchFeed.mockResolvedValue(pageResponse([makeFeedItem()], { total: 1 }))
    renderHome()
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()

    const input = screen.getByRole('searchbox', { name: 'Search bills' })
    fireEvent.change(input, { target: { value: 'hr1' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0, q: 'hr1' })
    })
    expect(screen.getByTestId('search-params')).toHaveTextContent('q=hr1')

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0 })
    })
    expect(screen.getByTestId('search-params').textContent).not.toContain('q=')
  })

  it('clears search on Escape from the search input', async () => {
    fetchFeed.mockResolvedValue(pageResponse([makeFeedItem()], { total: 1 }))
    renderHome('/?q=housing')
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()

    const input = screen.getByRole('searchbox', { name: 'Search bills' })
    expect(input).toHaveValue('housing')
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({ limit: 15, offset: 0 })
    })
    expect(screen.getByTestId('search-params').textContent).not.toContain('q=')
    expect(input).toHaveValue('')
  })

  it('shows search empty-state copy with a clear action and chamber context', async () => {
    fetchFeed.mockResolvedValue(pageResponse([], { total: 0 }))
    renderHome('/?chamber=House&q=xyz')

    expect(await screen.findByText('No House matches for “xyz”.')).toBeInTheDocument()
    expect(fetchFeed).toHaveBeenCalledWith({
      limit: 15,
      offset: 0,
      chamber: 'House',
      q: 'xyz',
    })

    // Toolbar × and empty-state CTA share the accessible name; use the empty CTA.
    const clearActions = screen.getAllByRole('button', { name: 'Clear search' })
    fireEvent.click(clearActions[clearActions.length - 1]!)
    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({
        limit: 15,
        offset: 0,
        chamber: 'House',
      })
    })
    expect(screen.getByTestId('search-params')).toHaveTextContent('chamber=House')
    expect(screen.getByTestId('search-params').textContent).not.toContain('q=')
  })

  it('combines search with chamber and preserves bill deep links in the URL', async () => {
    fetchFeed.mockResolvedValue(pageResponse([], { total: 0, has_more: false }))
    renderHome('/?chamber=Senate&q=sample&bill=119-s-2')

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenCalledWith({
        limit: 15,
        offset: 0,
        chamber: 'Senate',
        q: 'sample',
      })
    })
    expect(
      await screen.findByText('That bill is no longer in the recent feed.'),
    ).toBeInTheDocument()

    const params = screen.getByTestId('search-params').textContent ?? ''
    expect(params).toContain('chamber=Senate')
    expect(params).toContain('q=sample')
    expect(params).toContain('bill=119-s-2')
  })

  it('exposes a skip link targeting the main content landmark', async () => {
    renderHome()
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveAttribute('href', '#content')
    expect(document.getElementById('content')?.tagName).toBe('MAIN')
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
  })

  it('scopes deep links to the active chamber filter', async () => {
    const houseItem = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 1, title: 'House bill' },
      digest: {
        headline: 'House only bill',
        what_it_does: 'House summary',
        key_points: ['Point'],
        terms_explained: [],
      },
      passage_votes: [
        {
          chamber: 'House',
          congress: 119,
          session: 2,
          roll_number: 1,
          question: 'On Passage',
          result: 'Passed',
          yeas: 220,
          nays: 200,
          date: '2026-06-04',
        },
      ],
    })

    fetchFeed.mockImplementation(async (options: { chamber?: 'House' | 'Senate' }) => {
      if (options.chamber === 'Senate') {
        return pageResponse([], { total: 0 })
      }
      return pageResponse([houseItem], { total: 1 })
    })

    renderHome('/?chamber=Senate&bill=119-hr-1')

    expect(
      await screen.findByText('That bill is no longer in the recent feed.'),
    ).toBeInTheDocument()
    expect(fetchFeed).toHaveBeenCalledWith({
      limit: 15,
      offset: 0,
      chamber: 'Senate',
    })
    expect(screen.queryByText('House only bill')).not.toBeInTheDocument()
  })
})

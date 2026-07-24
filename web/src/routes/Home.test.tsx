import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearMemberProfileCache } from '../api/memberProfileCache'
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
  fetchDefectors,
  fetchMemberProfile,
  fetchSessionStats,
  fetchPulseStats,
  fetchPortfolioStats,
} = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  fetchNotableVotes: vi.fn(),
  fetchDefectors: vi.fn(),
  fetchMemberProfile: vi.fn(),
  fetchSessionStats: vi.fn(),
  fetchPulseStats: vi.fn(),
  fetchPortfolioStats: vi.fn(),
}))

vi.mock('../api/client', () => ({
  fetchFeed,
  fetchNotableVotes,
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

function renderHome(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
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
                congress_gov_url: 'https://www.congress.gov/member/f000466',
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
    })
    mockViewport(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
    clearMemberProfileCache()
    document.body.style.overflow = ''
  })

  it('renders the dense feed with rails and no flip hints', async () => {
    const { container } = renderHome()
    expect(screen.getByRole('heading', { name: 'Congress Tracker' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Site sections' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Plain headline for readers' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Congressional passage votes' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Federal Control' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Notable votes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Members in Congress')).toBeInTheDocument()
    expect(screen.getByLabelText('Legislative pulse')).toBeInTheDocument()
    expect(await screen.findAllByText('No close votes yet this session.')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Chronological timeline' })).toBeInTheDocument()
    expect(container.querySelector('.home-mobile-rails')).toBeNull()
    expect(container.querySelector('.home-rail--left')).not.toBeNull()
    expect(container.querySelector('.home-rail--right')).not.toBeNull()

    const feedList = container.querySelector('.feed-list')
    expect(feedList).not.toBeNull()
    expect(feedList?.tagName).toBe('UL')
    expect(within(feedList as HTMLElement).getByText('Passed')).toBeInTheDocument()
    expect(screen.queryByText('Flip for vote details ↺')).not.toBeInTheDocument()
    expect(container.querySelector('.feed-row')).not.toBeNull()
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

    expect(await screen.findByText('Deep linked bill')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /Deep linked bill/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
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
    })
    // Gate must not stick closed — session rail content can still render.
    expect(await screen.findByText('Federal Control')).toBeInTheDocument()
  })

  it('clears stale rows immediately when the chamber filter changes', async () => {
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

    renderHome()
    expect(await screen.findByText('Senate headline')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'House' }))
    expect(screen.queryByText('Senate headline')).not.toBeInTheDocument()
    expect(screen.queryByText('House headline')).not.toBeInTheDocument()

    resolveHouse(pageResponse([houseItem], { total: 1 }))
    expect(await screen.findByText('House headline')).toBeInTheDocument()
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

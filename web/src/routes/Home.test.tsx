import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearMemberProfileCache } from '../api/memberProfileCache'
import { makeFeedItem } from '../test/feedItemFixtures'
import {
  mockViewport,
  pageResponse,
  renderHome,
  stubHomeRouteDefaults,
} from '../test/homeRouteHarness'
import { resetSheetLayerForTests } from '../utils/sheetLayer'

const homeApi = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  fetchNotableVotes: vi.fn(),
  fetchRecentLaws: vi.fn(),
  fetchRecentConfirmations: vi.fn(),
  fetchCommitteesLeaderboard: vi.fn(),
  fetchDefectors: vi.fn(),
  fetchMemberProfile: vi.fn(),
  fetchMembersSearch: vi.fn(),
  fetchPolicyAreas: vi.fn(),
  fetchSessionStats: vi.fn(),
  fetchPulseStats: vi.fn(),
  fetchPortfolioStats: vi.fn(),
}))

const {
  fetchFeed,
  fetchNotableVotes,
  fetchRecentLaws,
  fetchRecentConfirmations,
  fetchDefectors,
  fetchMemberProfile,
  fetchSessionStats,
  fetchPulseStats,
} = homeApi

vi.mock('../api/client', () => homeApi)

describe('Home', () => {
  beforeEach(() => {
    stubHomeRouteDefaults(homeApi)
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
    const waitingHeadings = await screen.findAllByRole('heading', { name: 'Waiting in committee' })
    expect(waitingHeadings).toHaveLength(2)
    const closeHeadings = screen.getAllByRole('heading', { name: 'Close votes' })
    expect(closeHeadings.length).toBeGreaterThan(0)
    expect(
      waitingHeadings[0]!.compareDocumentPosition(closeHeadings[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('Energy and Commerce')).toBeInTheDocument()
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

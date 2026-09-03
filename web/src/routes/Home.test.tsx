import { maxIsoDay } from '@congress-tracker/shared/iso-day'
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
import { formatVoteDate } from '../utils/billLabels'
import { chamberFloorDetail } from '../utils/feedQuiet'
import { floorChipLabel } from '../utils/floorStatusCopy'
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
  fetchTightnessStats: vi.fn(),
  fetchVoteDefectors: vi.fn(),
  fetchPortfolioStats: vi.fn(),
}))

const {
  fetchFeed,
  fetchNotableVotes,
  fetchRecentLaws,
  fetchRecentConfirmations,
  fetchCommitteesLeaderboard,
  fetchDefectors,
  fetchMemberProfile,
  fetchSessionStats,
  fetchTightnessStats,
  fetchVoteDefectors,
} = homeApi

vi.mock('../api/client', () => homeApi)

function isoUtcDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Jane Doe confirmation `vote_date` from `stubHomeRouteDefaults`. */
const STUB_CONFIRMATION_DAY = '2026-06-12'

/**
 * Chip copy Home actually renders: House session last, Senate session last
 * plus confirmation days. Session stats are gated on `feedSettled`, so tests
 * must `findBy` this string rather than `getBy` it after the feed notice.
 */
function expectedFloorChip(houseLast: string, senateLast: string): string {
  const label = floorChipLabel(
    chamberFloorDetail('House', houseLast),
    chamberFloorDetail('Senate', maxIsoDay([senateLast, STUB_CONFIRMATION_DAY])),
  )
  if (!label) {
    throw new Error(`expected a floor chip for House ${houseLast} / Senate ${senateLast}`)
  }
  return label
}

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
    expect(await screen.findByRole('region', { name: 'Vote tightness' })).toBeInTheDocument()
    expect(
      await screen.findByRole('region', { name: 'House-passed, sitting in the Senate' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'New laws' })).toBeInTheDocument()
    expect(screen.getByLabelText('Members in Congress')).toBeInTheDocument()
    expect(screen.queryByLabelText('Legislative pulse')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Notable votes' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'House passage' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Senate bills & nominees' })).toBeInTheDocument()
    expect(screen.getByText('House-passed contracting bill waiting in the Senate')).toBeInTheDocument()
    expect(fetchCommitteesLeaderboard).not.toHaveBeenCalled()
    expect(fetchTightnessStats).toHaveBeenCalled()
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

  it('explains a quiet floor so the timeline does not look stuck', async () => {
    const latest = isoUtcDaysAgo(10)
    const chip = expectedFloorChip(latest, latest)
    expect(chip).toBe('House & Senate in recess')
    stubHomeRouteDefaults(homeApi, { house: latest, senate: latest })
    fetchFeed.mockResolvedValue(
      pageResponse([
        makeFeedItem({ latest_passage_date: latest, latest_activity_date: latest }),
      ]),
    )
    renderHome()
    expect(
      await screen.findByText(`No new House or Senate passage votes since ${formatVoteDate(latest)}.`),
    ).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`of 1 passage vote · through ${formatVoteDate(latest)}`)),
    ).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: new RegExp(chip) })).toHaveTextContent(chip)
  })

  it('opens floor status with House and Senate return dates from In recess', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-27T16:00:00.000Z'))
    stubHomeRouteDefaults(homeApi, { house: '2026-07-23', senate: '2026-08-08' })
    fetchFeed.mockResolvedValue(
      pageResponse([
        makeFeedItem({
          latest_passage_date: '2026-08-08',
          latest_activity_date: '2026-08-08',
        }),
      ]),
    )
    renderHome()
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(expectedFloorChip('2026-07-23', '2026-08-08')),
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Floor status' })
    expect(within(dialog).getByText('Back Monday, Aug 31')).toBeInTheDocument()
    expect(within(dialog).getByText('Back Monday, Sep 14')).toBeInTheDocument()
    expect(within(dialog).queryByText(/do not return together/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/set separate floor calendars/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /2026 House Calendar/ })).toHaveAttribute(
      'href',
      'https://pressgallery.house.gov/schedules/2026-house-calendar',
    )
    expect(
      within(dialog).getByRole('link', { name: /Senate 2026 legislative schedule/ }),
    ).toHaveAttribute('href', 'https://www.senate.gov/legislative/2026_schedule.htm')
  })

  it('omits the quiet notice when the newest vote is recent', async () => {
    const latest = isoUtcDaysAgo(1)
    const chip = expectedFloorChip(latest, latest)
    expect(chip).toBe('House & Senate working')
    stubHomeRouteDefaults(homeApi, { house: latest, senate: latest })
    fetchFeed.mockResolvedValue(
      pageResponse([
        makeFeedItem({ latest_passage_date: latest, latest_activity_date: latest }),
      ]),
    )
    renderHome()
    expect(await screen.findByRole('heading', { name: 'Chronological timeline' })).toBeInTheDocument()
    expect(
      screen.queryByText(/No new House or Senate passage votes since/),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`of 1 passage vote · through ${formatVoteDate(latest)}`)),
    ).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: new RegExp(chip) })).toHaveTextContent(chip)
    expect(screen.queryByText(/in recess/i)).not.toBeInTheDocument()
  })

  it('dates the quiet floor from passage votes, not an executive-boosted first row', async () => {
    const latest = isoUtcDaysAgo(10)
    stubHomeRouteDefaults(homeApi, { house: latest, senate: latest })
    fetchFeed.mockResolvedValue(
      pageResponse([
        makeFeedItem({
          bill: { congress: 119, type: 'HR', number: 1, title: 'Boosted' },
          latest_passage_date: '2026-04-10',
          latest_activity_date: '2026-08-24T14:26:00.000Z',
        }),
        makeFeedItem({ latest_passage_date: latest, latest_activity_date: latest }),
      ]),
    )
    renderHome()
    expect(
      await screen.findByText(`No new House or Senate passage votes since ${formatVoteDate(latest)}.`),
    ).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`of 2 passage votes · through ${formatVoteDate(latest)}`)),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
    expect(screen.queryByText(/through Apr 10/)).not.toBeInTheDocument()
  })

  it('names a chamber-filtered quiet floor and skips the notice while searching', async () => {
    const latest = isoUtcDaysAgo(10)
    stubHomeRouteDefaults(homeApi, { house: latest, senate: latest })
    fetchFeed.mockResolvedValue(
      pageResponse([
        makeFeedItem({
          latest_passage_date: latest,
          latest_activity_date: latest,
          passage_votes: [
            {
              chamber: 'House',
              congress: 119,
              session: 2,
              roll_number: 283,
              question: 'On Passage',
              result: 'Passed',
              yeas: 220,
              nays: 200,
              date: latest,
            },
          ],
        }),
      ]),
    )
    const { unmount } = renderHome('/?chamber=House')
    expect(
      await screen.findByText(`No new House passage votes since ${formatVoteDate(latest)}.`),
    ).toBeInTheDocument()
    expect(screen.queryByText(/House or Senate/)).not.toBeInTheDocument()
    unmount()

    renderHome('/?q=housing')
    expect(await screen.findByRole('heading', { name: 'Chronological timeline' })).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`of 1 passage vote · through ${formatVoteDate(latest)}`)),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No new .+ passage votes since/)).not.toBeInTheDocument()
  })

  it('does not date a House-filtered search from a Senate passage on the same bill', async () => {
    fetchFeed.mockResolvedValue(
      pageResponse([
        makeFeedItem({
          latest_passage_date: '2026-08-08',
          latest_activity_date: '2026-08-08',
          passage_votes: [
            {
              chamber: 'Senate',
              congress: 119,
              session: 2,
              roll_number: 228,
              question: 'On Passage of the Bill',
              result: 'Passed',
              yeas: 52,
              nays: 47,
              date: '2026-08-08',
            },
          ],
        }),
      ]),
    )
    renderHome('/?chamber=House&q=housing')
    // Floor status waits on session watermarks; the heading renders before they land.
    const defaultChip = expectedFloorChip('2026-06-05', '2026-06-05')
    expect(defaultChip).toBe('House & Senate in recess')
    expect(await screen.findByRole('button', { name: new RegExp(defaultChip) })).toHaveTextContent(
      defaultChip,
    )
    expect(screen.queryByText(/through Aug 8/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No new .+ passage votes since/)).not.toBeInTheDocument()
  })

  it('dates a House-filtered floor from House session watermarks, not a Senate passage on the same bill', async () => {
    fetchFeed.mockResolvedValue(
      pageResponse([
        makeFeedItem({
          latest_passage_date: '2026-08-08',
          latest_activity_date: '2026-08-08',
          passage_votes: [
            {
              chamber: 'Senate',
              congress: 119,
              session: 2,
              roll_number: 228,
              question: 'On Passage of the Bill',
              result: 'Passed',
              yeas: 52,
              nays: 47,
              date: '2026-08-08',
            },
          ],
        }),
      ]),
    )
    renderHome('/?chamber=House')
    expect(
      await screen.findByText('No new House passage votes since Jun 5.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/1 of 1 passage vote · through Jun 5 · House/)).toBeInTheDocument()
    expect(screen.queryByText(/since Aug 8/)).not.toBeInTheDocument()
    const houseFilteredChip = expectedFloorChip('2026-06-05', '2026-06-05')
    expect(houseFilteredChip).toBe('House & Senate in recess')
    expect(await screen.findByRole('button', { name: new RegExp(houseFilteredChip) })).toHaveTextContent(
      houseFilteredChip,
    )
  })

  it('marks an in-session lull separately from recess', async () => {
    const latest = isoUtcDaysAgo(4)
    const chip = expectedFloorChip(latest, latest)
    expect(chip).toBe('House & Senate in session')
    stubHomeRouteDefaults(homeApi, { house: latest, senate: latest })
    fetchFeed.mockResolvedValue(
      pageResponse([
        makeFeedItem({ latest_passage_date: latest, latest_activity_date: latest }),
      ]),
    )
    renderHome()
    expect(await screen.findByRole('button', { name: new RegExp(chip) })).toHaveTextContent(chip)
    expect(
      screen.getByText(`No new House or Senate passage votes since ${formatVoteDate(latest)}.`),
    ).toBeInTheDocument()
    expect(screen.queryByText(/in recess/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/working/i)).not.toBeInTheDocument()
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

    const tightnessMobile = container.querySelector('.home-tightness-mobile')
    expect(tightnessMobile).not.toBeNull()
    expect(secondary!.contains(tightnessMobile)).toBe(true)
    expect(
      feedSection!.compareDocumentPosition(tightnessMobile!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(within(tightnessMobile as HTMLElement).getByRole('heading', { name: 'House passage' })).toBeInTheDocument()
    expect(
      within(tightnessMobile as HTMLElement).getByRole('heading', { name: 'Senate bills & nominees' }),
    ).toBeInTheDocument()
    expect(
      tightnessMobile!.querySelector('[data-tightness-row="house"]'),
    ).not.toBeNull()
    expect(
      tightnessMobile!.querySelector('[data-tightness-row="senate"]'),
    ).not.toBeNull()

    expect(
      within(secondary as HTMLElement).getByRole('region', {
        name: 'House-passed, sitting in the Senate',
      }),
    ).toBeInTheDocument()

    const sections = mobileRails!.querySelectorAll(':scope > .home-mobile-rail-section')
    expect(sections).toHaveLength(2)
    expect(within(sections[0] as HTMLElement).getByRole('region', { name: 'Federal Control' })).toBeInTheDocument()
    expect(sections[1]).toHaveAttribute('aria-label', 'Members in Congress')

    fireEvent.click(
      within(secondary as HTMLElement).getByRole('button', {
        name: /House-passed contracting bill waiting in the Senate/,
      }),
    )
    expect(screen.getByTestId('search-params')).toHaveTextContent('bill=119-hr-33')
    expect(screen.getByTestId('search-params').textContent).not.toContain('chamber=')

    expect(screen.getAllByRole('region', { name: 'Vote tightness' })).toHaveLength(1)
    expect(screen.getAllByRole('region', { name: 'Federal Control' })).toHaveLength(1)
    await waitFor(() => {
      expect(fetchTightnessStats).toHaveBeenCalledTimes(1)
      expect(fetchRecentLaws).toHaveBeenCalledTimes(1)
      expect(fetchDefectors).toHaveBeenCalledTimes(2)
    })
  })

  it('keeps both tightness rows on mobile when the feed is empty', async () => {
    mockViewport(false)
    fetchFeed.mockResolvedValue(pageResponse([], { total: 0, has_more: false }))
    const { container } = renderHome('/?q=nomatch')

    expect(await screen.findByText(/No matches for “nomatch”/)).toBeInTheDocument()
    const tightnessMobile = container.querySelector('.home-tightness-mobile')
    expect(tightnessMobile).not.toBeNull()
    expect(container.querySelector('.home-feed-empty')?.contains(tightnessMobile)).toBe(false)
    expect(container.querySelector('.home-feed-secondary')?.contains(tightnessMobile)).toBe(true)
    expect(tightnessMobile!.querySelector('[data-tightness-row="house"]')).not.toBeNull()
    expect(tightnessMobile!.querySelector('[data-tightness-row="senate"]')).not.toBeNull()
  })

  it('keeps mobile closest-votes full-width beside a failed feed card', async () => {
    mockViewport(false)
    fetchFeed.mockRejectedValueOnce(new Error('network down'))
    const { container } = renderHome()

    expect(await screen.findByText("Couldn't load the feed.")).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /House bill H\.R\. 88, 210–208, party-line/ }),
    ).toBeInTheDocument()
    const tightnessMobile = container.querySelector('.home-tightness-mobile')
    expect(tightnessMobile).not.toBeNull()
    expect(tightnessMobile!.closest('.rounded-card')).toBeNull()
    expect(container.querySelector('.home-feed-secondary')?.contains(tightnessMobile)).toBe(true)
    expect(tightnessMobile!.querySelector('[data-tightness-row="house"]')).not.toBeNull()
    expect(tightnessMobile!.querySelector('[data-tightness-row="senate"]')).not.toBeNull()
    expect(screen.queryByText('No close House passage votes.')).not.toBeInTheDocument()
  })

  it('opens a Senate-waiting bill without leftover feed filters', async () => {
    mockViewport(false)
    renderHome('/?chamber=Senate&q=lands')

    fireEvent.click(
      await screen.findByRole('button', {
        name: /House-passed contracting bill waiting in the Senate/,
      }),
    )

    const params = screen.getByTestId('search-params').textContent ?? ''
    expect(params).toContain('bill=119-hr-33')
    expect(params).not.toContain('chamber=')
    expect(params).not.toContain('q=')
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

  it('opens a vote-level defector sheet from a closest-vote bar tap', async () => {
    mockViewport(false)
    renderHome()

    const knifeEdge = await screen.findByRole('button', {
      name: /House bill H\.R\. 88, 210–208, party-line/,
    })
    fireEvent.click(knifeEdge)

    const dialog = await screen.findByRole('dialog', { name: 'H.R. 88' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Who broke with their party' })).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchVoteDefectors).toHaveBeenCalled()
      expect(within(dialog).getByText('Rep. Sample Crossover (local)')).toBeInTheDocument()
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
    expect(fetchTightnessStats).not.toHaveBeenCalled()
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
      expect(fetchTightnessStats).toHaveBeenCalled()
      expect(fetchDefectors).toHaveBeenCalled()
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
      expect(fetchTightnessStats).toHaveBeenCalled()
      expect(fetchDefectors).toHaveBeenCalled()
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

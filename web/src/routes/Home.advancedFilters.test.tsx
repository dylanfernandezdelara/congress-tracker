import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
  fetchTightnessStats: vi.fn(),
  fetchVoteDefectors: vi.fn(),
  fetchPortfolioStats: vi.fn(),
}))

const {
  fetchFeed,
  fetchMemberProfile,
  fetchMembersSearch,
} = homeApi

vi.mock('../api/client', () => homeApi)

describe('Home advanced filters', () => {
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
    expect(screen.getByText(/1 of 1 passage vote · through .+ · New York/)).toBeInTheDocument()
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

  it('commits a typed member name when Done closes the filter sheet', async () => {
    mockViewport(false)
    fetchFeed
      .mockResolvedValueOnce(pageResponse([makeFeedItem()], { total: 1 }))
      .mockResolvedValue(pageResponse([makeFeedItem()], { total: 1 }))

    renderHome()
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    const memberInput = within(dialog).getByPlaceholderText('Name or last name')
    fireEvent.change(memberInput, { target: { value: 'Schumer' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))

    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({
        limit: 15,
        offset: 0,
        sponsorQ: 'Schumer',
      })
    })
    expect(screen.getByTestId('search-params').textContent).toContain('sponsor_q=Schumer')
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument()
  })

  it('keeps an exact sponsor selection while typing until the draft is committed', async () => {
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
    fetchFeed.mockResolvedValue(pageResponse([makeFeedItem()], { total: 1 }))

    renderHome('/?sponsor=LOCAL%3AH002')
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(fetchFeed).toHaveBeenLastCalledWith({
      limit: 15,
      offset: 0,
      sponsor: 'LOCAL:H002',
    })

    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    const memberInput = screen.getByPlaceholderText('Name or last name')
    fireEvent.change(memberInput, { target: { value: 'Schumer' } })

    expect(fetchFeed).toHaveBeenLastCalledWith({
      limit: 15,
      offset: 0,
      sponsor: 'LOCAL:H002',
    })
    expect(screen.getByTestId('search-params').textContent).toContain('sponsor=LOCAL%3AH002')

    fireEvent.blur(memberInput)
    await waitFor(() => {
      expect(fetchFeed).toHaveBeenLastCalledWith({
        limit: 15,
        offset: 0,
        sponsorQ: 'Schumer',
      })
    })
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

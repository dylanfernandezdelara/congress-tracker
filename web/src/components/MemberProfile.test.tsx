import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearMemberProfileCache, loadMemberProfile } from '../api/memberProfileCache'
import { resetSheetLayerForTests } from '../utils/sheetLayer'
import type { MemberProfileResponse } from '../api/types'
import { MemberProfile, type MemberProfileSeed } from './MemberProfile'

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

function SearchParamsProbe() {
  const [params] = useSearchParams()
  return <div data-testid="search-params">{params.toString()}</div>
}

function renderProfile(ui: ReactElement, initialEntry = '/') {
  const view = render(
    <MemoryRouter initialEntries={[initialEntry]} future={routerFuture}>
      <SearchParamsProbe />
      {ui}
    </MemoryRouter>,
  )
  return {
    ...view,
    rerender(next: ReactElement) {
      view.rerender(
        <MemoryRouter initialEntries={[initialEntry]} future={routerFuture}>
          <SearchParamsProbe />
          {next}
        </MemoryRouter>,
      )
    },
  }
}

const seed: MemberProfileSeed = {
  bioguide_id: 'F000466',
  name: 'Brian Fitzpatrick',
  party: 'R',
  state: 'PA',
  photo_url: 'https://example.com/fitz.jpg',
  cross_vote_count: 8,
  cross_vote_label: 'frequent',
}

const profile: MemberProfileResponse = {
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
  votes_cast: 42,
  yea_count: 30,
  nay_count: 12,
  cross_vote_count: 8,
  cross_vote_label: 'frequent',
  recent_cross_votes: [
    {
      chamber: 'House',
      congress: 119,
      session: 2,
      roll_number: 214,
      bill_type: 'S',
      bill_number: 2,
      bill_congress: 119,
      bill_id: '119-s-2',
      title: 'Public Lands and Waters Protection Act',
      headline: 'Senate passes a public lands conservation and access bill',
      in_feed: true,
      vote_date: '2026-06-09',
      position: 'yea',
      party_line: 'nay',
      margin: 2,
    },
  ],
  sponsored_bills: [
    {
      bill_id: '119-hr-22',
      congress: 119,
      bill_type: 'HR',
      bill_number: 22,
      title: 'Government Accountability and Savings Act',
      headline: 'House passes a federal spending oversight bill',
      introduced_date: '2026-06-01',
      policy_area: 'Government Operations and Politics',
      latest_action_text: 'Presented to President.',
      in_feed: true,
    },
  ],
  sponsored_bills_total: 1,
  member_votes_available: true,
  as_of: '2026-07-20T00:00:00.000Z',
}

vi.mock('../api/client', () => ({
  fetchMemberProfile: vi.fn(),
}))

import { ApiError } from '../api/fetchJson'
import { fetchMemberProfile } from '../api/client'

const fetchMemberProfileMock = vi.mocked(fetchMemberProfile)

/* jsdom has no AnimationEvent constructor, so fireEvent.animationEnd drops the
   animationName init; build the event by hand instead. */
function endAnimation(element: HTMLElement, animationName: string) {
  const event = new Event('animationend', { bubbles: true })
  Object.defineProperty(event, 'animationName', { value: animationName })
  fireEvent(element, event)
}

afterEach(() => {
  vi.clearAllMocks()
  clearMemberProfileCache()
  resetSheetLayerForTests()
  document.body.style.overflow = ''
})

describe('MemberProfile', () => {
  it('renders nothing when closed', () => {
    const { container } = renderProfile(
      <MemberProfile open={false} seed={seed} selectionKey={1} onClose={() => undefined} />,
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows seed identity immediately and loads session stats', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    expect(screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Voting record' })).toBeInTheDocument()
    expect(screen.getByText('Frequent cross-voter')).toBeInTheDocument()
    expect(screen.getByText('BF')).toBeInTheDocument()
    expect(screen.getByText('Republican')).toBeInTheDocument()
    expect(screen.getByText('R-PA')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    expect(screen.getByText('Republican')).toBeInTheDocument()
    expect(screen.getByText('House')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('30 / 12')).toBeInTheDocument()
    expect(screen.getByText('Senate passes a public lands conservation and access bill')).toBeInTheDocument()
    expect(screen.getByText(/S\. 2 · /)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Recent party-line breaks' })).toBeInTheDocument()
    expect(screen.getByText(/Voted yea against party · margin 2/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Senate passes a public lands conservation and access bill/ }),
    ).toHaveAttribute('href', '/?bill=119-s-2')
    expect(screen.getByRole('region', { name: 'Sponsored bills' })).toBeInTheDocument()
    expect(screen.getByText('House passes a federal spending oversight bill')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /House passes a federal spending oversight bill/ }),
    ).toHaveAttribute('href', '/?bill=119-hr-22')
    expect(screen.getByText('Presented to President.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View on Congress.gov' })).toHaveAttribute(
      'href',
      'https://www.congress.gov/member/brian-fitzpatrick/F000466',
    )
  })

  it('renders stats on the first frame when the profile was prefetched', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    await loadMemberProfile(seed.bioguide_id)

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    expect(screen.queryByText('Loading session voting stats…')).not.toBeInTheDocument()
    expect(screen.getByText('PA-1')).toBeInTheDocument()
    expect(screen.getByText('Republican')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('shows a loading message while session stats are in flight', () => {
    fetchMemberProfileMock.mockReturnValue(new Promise(() => undefined))

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    expect(screen.getByText('Loading session voting stats…')).toBeInTheDocument()
    expect(screen.getByText('R-PA')).toBeInTheDocument()
  })

  it('shows the fetch error when the profile request fails', async () => {
    fetchMemberProfileMock.mockRejectedValue(new Error('member profile unavailable'))

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('member profile unavailable')).toBeInTheDocument()
    })
  })

  it('shows a member-specific message when the profile is 404', async () => {
    fetchMemberProfileMock.mockRejectedValue(
      new ApiError('No data found. Data may not be available yet.', 404, 'Not Found'),
    )

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('Profile not available for this member')).toBeInTheDocument()
    })
  })

  it('omits the cross-vote hint and derives a photo when the seed lacks those fields', async () => {
    fetchMemberProfileMock.mockResolvedValue({ ...profile, photo_url: '', cross_vote_label: 'rare' })

    renderProfile(
      <MemberProfile
        open
        seed={{
          bioguide_id: seed.bioguide_id,
          name: seed.name,
          party: seed.party,
          state: seed.state,
        }}
        selectionKey={1}
        onClose={() => undefined}
      />,
    )

    expect(screen.queryByText('Frequent cross-voter')).not.toBeInTheDocument()
    expect(screen.queryByText('Rare party-line break')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Rare party-line break')).toBeInTheDocument()
    })
    expect(screen.getByText('PA-1')).toBeInTheDocument()
  })

  it('shows the unavailable message when member votes are missing', async () => {
    fetchMemberProfileMock.mockResolvedValue({ ...profile, member_votes_available: false })

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(
        screen.getByText('Per-member vote history is not available for this session yet.'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('region', { name: 'Recent party-line breaks' })).not.toBeInTheDocument()
  })

  it('closes on Escape and backdrop click after the exit animation', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    const dialog = screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    // The departing dialog must be inert (unfocusable, hidden from AT).
    expect(dialog.closest('.sheet-root')).toHaveAttribute('inert')
    // A stray enter-animation end must not finish the close.
    endAnimation(dialog, 'sheet-rise')
    expect(onClose).not.toHaveBeenCalled()
    endAnimation(dialog, 'sheet-sink')
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }))
    endAnimation(dialog, 'sheet-sink')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores repeated close requests while the exit animation is running', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    const dialog = screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }))
    endAnimation(dialog, 'sheet-sink')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending close when a new profile is selected mid-animation', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    const { rerender } = renderProfile(
      <MemberProfile open seed={seed} selectionKey={1} onClose={onClose} />,
    )

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })

    const otherSeed: MemberProfileSeed = {
      ...seed,
      bioguide_id: 'G000002',
      name: 'Grace Other',
    }
    rerender(<MemberProfile open seed={otherSeed} selectionKey={2} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Grace Other' })
    endAnimation(dialog, 'sheet-sink')

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Grace Other' })).toBeInTheDocument()
  })

  it('cancels a pending close when the same member is re-selected mid-animation', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    const { rerender } = renderProfile(
      <MemberProfile open seed={seed} selectionKey={1} onClose={onClose} />,
    )

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })

    /* Re-selecting the same member bumps selectionKey with an unchanged seed. */
    rerender(<MemberProfile open seed={seed} selectionKey={2} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })
    expect(dialog.closest('.sheet-root')).not.toHaveAttribute('inert')
    // Cancelling the close pulls focus back into the still-open modal.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    endAnimation(dialog, 'sheet-sink')

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })).toBeInTheDocument()
  })

  it('labels a Senate seat as Senator · state', async () => {
    fetchMemberProfileMock.mockResolvedValue({
      ...profile,
      chamber: 'Senate',
      district: null,
      state: 'TX',
    })

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('Senator · TX')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { level: 3, name: /Voting record/ })).toBeInTheDocument()
  })

  it('labels a House at-large seat when district is 0', async () => {
    fetchMemberProfileMock.mockResolvedValue({ ...profile, district: 0, state: 'AK' })

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('AK at-large')).toBeInTheDocument()
    })
    expect(screen.queryByText('AK-0')).not.toBeInTheDocument()
    expect(screen.queryByText('Representative from AK')).not.toBeInTheDocument()
  })

  it('does not treat a null House district as at-large', async () => {
    fetchMemberProfileMock.mockResolvedValue({ ...profile, district: null, state: 'SC' })

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('Representative from SC')).toBeInTheDocument()
    })
    expect(screen.queryByText('SC at-large')).not.toBeInTheDocument()
  })

  it('labels a numbered House district as state-district', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { level: 2, name: 'Brian Fitzpatrick' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Recent party-line breaks' })).toBeInTheDocument()
  })

  it('falls back to initials when photo_url is empty and does not render an img', async () => {
    fetchMemberProfileMock.mockResolvedValue({ ...profile, photo_url: '' })

    renderProfile(
      <MemberProfile
        open
        seed={{ ...seed, photo_url: '' }}
        selectionKey={1}
        onClose={() => undefined}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    expect(screen.getByText('BF')).toBeInTheDocument()
    expect(screen.getByText('BF')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('dialog', { name: 'Brian Fitzpatrick' }).querySelector('img')).toBeNull()
  })

  it('renders Other for an unrecognized party code', async () => {
    fetchMemberProfileMock.mockResolvedValue({ ...profile, party: '?' })

    renderProfile(
      <MemberProfile
        open
        seed={{ ...seed, party: '?' }}
        selectionKey={1}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByText('Other')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    expect(screen.getByText('Other')).toBeInTheDocument()
    expect(screen.queryByText('Republican')).not.toBeInTheDocument()
  })

  it('falls back from headline to title to the short bill id on cross-vote rows', async () => {
    fetchMemberProfileMock.mockResolvedValue({
      ...profile,
      recent_cross_votes: [
        {
          ...profile.recent_cross_votes[0]!,
          headline: null,
          title: 'Public Lands and Waters Protection Act',
        },
        {
          ...profile.recent_cross_votes[0]!,
          roll_number: 215,
          bill_type: 'HR',
          bill_number: 1234,
          bill_id: '119-hr-1234',
          headline: null,
          title: '',
        },
      ],
    })

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('Public Lands and Waters Protection Act')).toBeInTheDocument()
    })
    expect(screen.getByText('H.R. 1234')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /H\.R\. 1234/ })).toHaveAttribute(
      'href',
      '/?bill=119-hr-1234',
    )
  })

  it('hides the sponsored section when there are no bills and votes are unavailable', async () => {
    fetchMemberProfileMock.mockResolvedValue({
      ...profile,
      member_votes_available: false,
      sponsored_bills: [],
      sponsored_bills_total: 0,
    })

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(
        screen.getByText('Per-member vote history is not available for this session yet.'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('region', { name: 'Sponsored bills' })).not.toBeInTheDocument()
    expect(screen.queryByText('No sponsored bills in this Congress')).not.toBeInTheDocument()
  })

  it('shows a muted empty line when votes exist but there are no sponsored bills', async () => {
    fetchMemberProfileMock.mockResolvedValue({
      ...profile,
      sponsored_bills: [],
      sponsored_bills_total: 0,
    })

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('No sponsored bills in this Congress')).toBeInTheDocument()
    })
    expect(screen.queryByText('5 of 23')).not.toBeInTheDocument()
  })

  it('shows N of M when more sponsored bills exist than the sheet lists', async () => {
    fetchMemberProfileMock.mockResolvedValue({
      ...profile,
      sponsored_bills: [
        profile.sponsored_bills[0]!,
        {
          ...profile.sponsored_bills[0]!,
          bill_id: '119-hr-1',
          bill_number: 1,
          headline: 'House passes a broad energy permitting and production package',
          title: 'Lower Energy Costs Act',
          policy_area: 'Energy',
        },
      ],
      sponsored_bills_total: 23,
    })

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('2 of 23')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('link', { name: /House passes a broad energy permitting and production package/ }),
    ).toHaveAttribute('href', '/?bill=119-hr-1')
    expect(screen.getByText('Energy')).toBeInTheDocument()
  })

  it('links out-of-window bills to Congress.gov and in-feed bills to the timeline', async () => {
    fetchMemberProfileMock.mockResolvedValue({
      ...profile,
      recent_cross_votes: [{ ...profile.recent_cross_votes[0]!, in_feed: false }],
      sponsored_bills: [
        { ...profile.sponsored_bills[0]!, in_feed: true },
        {
          ...profile.sponsored_bills[0]!,
          bill_id: '119-hr-99',
          bill_number: 99,
          headline: 'House bill would publish member portfolio snapshots',
          title: 'Member Portfolio Transparency Act',
          latest_action_text: 'Referred to the House Committee on Oversight.',
          in_feed: false,
        },
      ],
      sponsored_bills_total: 2,
    })

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByText('Referred to the House Committee on Oversight.')).toBeInTheDocument()
    })
    const congressGovCross = screen.getByRole('link', {
      name: /Senate passes a public lands conservation and access bill.*opens Congress\.gov/,
    })
    expect(congressGovCross).toHaveAttribute(
      'href',
      'https://www.congress.gov/bill/119th-congress/senate-bill/2',
    )
    expect(congressGovCross).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      screen.getByRole('link', { name: /House passes a federal spending oversight bill/ }),
    ).toHaveAttribute('href', '/?bill=119-hr-22')
    const congressGovSponsored = screen.getByRole('link', {
      name: /House bill would publish member portfolio snapshots.*opens Congress\.gov/,
    })
    expect(congressGovSponsored).toHaveAttribute(
      'href',
      'https://www.congress.gov/bill/119th-congress/house-bill/99',
    )
    expect(congressGovSponsored).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('keeps current filters when an in-feed row sets bill', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)

    renderProfile(
      <MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />,
      '/?chamber=House&q=energy',
    )

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /House passes a federal spending oversight bill/ }),
      ).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('link', { name: /House passes a federal spending oversight bill/ }),
    )
    await waitFor(() => {
      const search = screen.getByTestId('search-params').textContent ?? ''
      expect(search).toContain('chamber=House')
      expect(search).toContain('q=energy')
      expect(search).toContain('bill=119-hr-22')
    })
  })

  it('closes the sheet after an in-feed bill link navigates', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={onClose} />)

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /House passes a federal spending oversight bill/ }),
      ).toBeInTheDocument()
    })
    const dialog = screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })
    fireEvent.click(
      screen.getByRole('link', { name: /House passes a federal spending oversight bill/ }),
    )
    await waitFor(() => {
      expect(dialog.closest('.sheet-root')).toHaveAttribute('inert')
    })
    endAnimation(dialog, 'sheet-sink')
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the sheet open when an in-feed bill link is opened in a new tab', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={onClose} />)

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /House passes a federal spending oversight bill/ }),
      ).toBeInTheDocument()
    })
    const dialog = screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })
    fireEvent.click(
      screen.getByRole('link', { name: /House passes a federal spending oversight bill/ }),
      { metaKey: true },
    )
    await Promise.resolve()
    expect(dialog.closest('.sheet-root')).not.toHaveAttribute('inert')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders a stale pre-enrichment payload without throwing', async () => {
    fetchMemberProfileMock.mockResolvedValue({
      ...profile,
      recent_cross_votes: [
        {
          chamber: 'House',
          congress: 119,
          session: 2,
          roll_number: 214,
          bill_type: 'S',
          bill_number: 2,
          bill_congress: 119,
          vote_date: '2026-06-09',
          position: 'yea',
          party_line: 'nay',
          margin: 2,
        },
      ],
      sponsored_bills: undefined,
      sponsored_bills_total: undefined,
    } as unknown as MemberProfileResponse)

    renderProfile(<MemberProfile open seed={seed} selectionKey={1} onClose={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })).toBeInTheDocument()
    })
    expect(screen.getByText('S. 2')).toBeInTheDocument()
    expect(screen.getByText('No sponsored bills in this Congress')).toBeInTheDocument()
  })
})

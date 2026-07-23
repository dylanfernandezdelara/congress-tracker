import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MemberProfileResponse } from '../api/types'
import { MemberProfile, type MemberProfileSeed } from './MemberProfile'

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
  congress_gov_url: 'https://www.congress.gov/member/f000466',
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
      vote_date: '2026-06-09',
      position: 'yea',
      party_line: 'nay',
      margin: 2,
    },
  ],
  member_votes_available: true,
  as_of: '2026-07-20T00:00:00.000Z',
}

vi.mock('../api/client', () => ({
  fetchMemberProfile: vi.fn(),
}))

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
  document.body.style.overflow = ''
})

describe('MemberProfile', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MemberProfile open={false} seed={seed} onClose={() => undefined} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows seed identity immediately and loads session stats', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)

    render(<MemberProfile open seed={seed} onClose={() => undefined} />)

    expect(screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })).toBeInTheDocument()
    expect(screen.getByText('Frequent cross-voter')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('30 / 12')).toBeInTheDocument()
    expect(screen.getByText(/S\. 2/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View on Congress.gov' })).toHaveAttribute(
      'href',
      'https://www.congress.gov/member/f000466',
    )
  })

  it('closes on Escape and backdrop click after the exit animation', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    render(<MemberProfile open seed={seed} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    const dialog = screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    // A stray enter-animation end must not finish the close.
    endAnimation(dialog, 'member-profile-rise')
    expect(onClose).not.toHaveBeenCalled()
    endAnimation(dialog, 'member-profile-sink')
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }))
    endAnimation(dialog, 'member-profile-fade-out')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores repeated close requests while the exit animation is running', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    render(<MemberProfile open seed={seed} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
    const dialog = screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }))
    endAnimation(dialog, 'member-profile-sink')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending close when a new profile is selected mid-animation', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    const { rerender } = render(<MemberProfile open seed={seed} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })

    const otherSeed: MemberProfileSeed = {
      ...seed,
      bioguide_id: 'G000002',
      name: 'Grace Other',
    }
    rerender(<MemberProfile open seed={otherSeed} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Grace Other' })
    endAnimation(dialog, 'member-profile-sink')

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Grace Other' })).toBeInTheDocument()
  })
})

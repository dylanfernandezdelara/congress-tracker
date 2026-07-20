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

  it('closes on Escape and backdrop click', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    const onClose = vi.fn()

    render(<MemberProfile open seed={seed} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

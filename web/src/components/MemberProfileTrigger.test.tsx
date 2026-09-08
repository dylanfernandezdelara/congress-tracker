import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearMemberProfileCache } from '../api/memberProfileCache'
import { renderWithMemberProfile } from '../test/memberProfileHarness'
import { resetSheetLayerForTests } from '../utils/sheetLayer'
import type { MemberProfileSeed } from './MemberProfile'
import { MemberProfileTrigger } from './MemberProfileTrigger'

vi.mock('../api/client', () => ({
  fetchMemberProfile: vi.fn(),
}))

import { fetchMemberProfile } from '../api/client'

const seed: MemberProfileSeed = {
  bioguide_id: 'F000466',
  name: 'Brian Fitzpatrick',
  party: 'R',
  state: 'PA',
}

afterEach(() => {
  vi.clearAllMocks()
  clearMemberProfileCache()
  resetSheetLayerForTests()
  document.body.style.overflow = ''
})

describe('MemberProfileTrigger', () => {
  it('renders LIS: and empty ids as plain text without calling the profile hook', () => {
    render(
      <MemberProfileTrigger
        seed={{ ...seed, bioguide_id: 'LIS:S123', name: 'Sen. Placeholder' }}
        className="feed-row-sponsor-name"
      >
        Sen. Placeholder
      </MemberProfileTrigger>,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Sen. Placeholder')).toBeInTheDocument()
    expect(screen.getByText('Sen. Placeholder').tagName).toBe('SPAN')
  })

  it('opens the member profile for a real bioguide', async () => {
    vi.mocked(fetchMemberProfile).mockResolvedValue({
      ...seed,
      chamber: 'House',
      district: 1,
      photo_url: '',
      congress_gov_url: null,
      congress: 119,
      session: 2,
      votes_cast: 10,
      yea_count: 6,
      nay_count: 4,
      cross_vote_count: 1,
      cross_vote_label: 'rare',
      recent_cross_votes: [],
      member_votes_available: true,
      as_of: '2026-07-20T00:00:00.000Z',
    })

    renderWithMemberProfile(
      <MemberProfileTrigger seed={seed}>Brian Fitzpatrick</MemberProfileTrigger>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open profile for Brian Fitzpatrick' }))
    expect(screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearMemberProfileCache } from '../api/memberProfileCache'
import { renderWithMemberProfile } from '../test/memberProfileHarness'
import { resetSheetLayerForTests } from '../utils/sheetLayer'
import { PassageVoteDetails, VoteSplitBar } from './PassageVoteDetails'

vi.mock('../api/client', () => ({
  fetchMemberProfile: vi.fn(),
}))

import { fetchMemberProfile } from '../api/client'

const senateVote = {
  chamber: 'Senate' as const,
  congress: 119,
  session: 2,
  roll_number: 10,
  question: 'On Passage',
  result: 'Passed',
  yeas: 52,
  nays: 47,
  date: '2026-06-05',
}

afterEach(() => {
  vi.clearAllMocks()
  clearMemberProfileCache()
  resetSheetLayerForTests()
  document.body.style.overflow = ''
})

describe('VoteSplitBar', () => {
  it('exposes an accessible vote summary', () => {
    render(<VoteSplitBar chamber="House" yeas={220} nays={213} />)
    expect(screen.getByRole('img', { name: 'House vote: 220 yea, 213 nay' })).toBeInTheDocument()
  })
})

describe('PassageVoteDetails', () => {
  it('labels each chamber split bar from vote props', () => {
    render(
      <PassageVoteDetails
        votes={[senateVote]}
        defectorsByRoll={new Map()}
      />,
    )

    expect(screen.getByRole('img', { name: 'Senate vote: 52 yea, 47 nay' })).toBeInTheDocument()
    expect(screen.getByText('52–47')).toBeInTheDocument()
  })

  it('opens the member profile for bioguide names and leaves LIS: ids as text', async () => {
    vi.mocked(fetchMemberProfile).mockResolvedValue({
      bioguide_id: 'C001088',
      name: 'Chris Coons',
      chamber: 'Senate',
      party: 'D',
      state: 'DE',
      district: null,
      photo_url: '',
      congress_gov_url: 'https://www.congress.gov/member/chris-coons/C001088',
      congress: 119,
      session: 2,
      votes_cast: 12,
      yea_count: 8,
      nay_count: 4,
      cross_vote_count: 1,
      cross_vote_label: 'rare',
      recent_cross_votes: [],
      member_votes_available: true,
      as_of: '2026-07-20T00:00:00.000Z',
    })

    renderWithMemberProfile(
      <PassageVoteDetails
        votes={[senateVote]}
        defectorsByRoll={
          new Map([
            [
              'Senate:119:2:10',
              {
                status: 'ready' as const,
                defectors: [
                  {
                    bioguide_id: 'C001088',
                    name: 'Chris Coons',
                    party: 'D',
                    state: 'DE',
                    position: 'nay' as const,
                    party_line: 'yea' as const,
                    congress_gov_url:
                      'https://www.congress.gov/member/chris-coons/C001088',
                  },
                  {
                    bioguide_id: 'LIS:S123',
                    name: 'Sen. Placeholder',
                    party: 'R',
                    state: 'TX',
                    position: 'yea' as const,
                    party_line: 'nay' as const,
                    congress_gov_url: null,
                  },
                ],
                partySplits: [],
              },
            ],
          ])
        }
      />,
    )

    const profileButton = screen.getByRole('button', { name: 'Open profile for Chris Coons' })
    expect(profileButton.closest('li')).toHaveTextContent(/^Chris Coons\s*D-DE$/)
    expect(
      screen.queryByRole('link', { name: 'Chris Coons' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open profile for Sen. Placeholder' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Sen. Placeholder').closest('li')).toHaveTextContent(
      /^Sen. Placeholder\s*R-TX$/,
    )

    fireEvent.click(profileButton)
    expect(screen.getByRole('dialog', { name: 'Chris Coons' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'View on Congress.gov' })).toBeInTheDocument()
    })
  })
})

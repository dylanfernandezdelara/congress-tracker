import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { holdSheetExit, pressEscapeIn } from '../test/sheetExit'

import { clearMemberProfileCache } from '../api/memberProfileCache'
import type { MemberProfileResponse } from '../api/types'
import type { MemberProfileSeed } from './MemberProfile'
import { MemberProfileProvider, useOpenMemberProfile } from './MemberProfileProvider'

vi.mock('../api/client', () => ({
  fetchMemberProfile: vi.fn(),
}))

import { fetchMemberProfile } from '../api/client'

const fetchMemberProfileMock = vi.mocked(fetchMemberProfile)

const seedA: MemberProfileSeed = {
  bioguide_id: 'F000466',
  name: 'Brian Fitzpatrick',
  party: 'R',
  state: 'PA',
}

const seedB: MemberProfileSeed = {
  bioguide_id: 'G000002',
  name: 'Grace Other',
  party: 'D',
  state: 'CA',
}

const profileA: MemberProfileResponse = {
  bioguide_id: 'F000466',
  name: 'Brian Fitzpatrick',
  chamber: 'House',
  party: 'R',
  state: 'PA',
  district: 1,
  photo_url: '',
  congress_gov_url: 'https://www.congress.gov/member/brian-fitzpatrick/F000466',
  congress: 119,
  session: 2,
  votes_cast: 20,
  yea_count: 12,
  nay_count: 8,
  cross_vote_count: 5,
  cross_vote_label: 'occasional',
  recent_cross_votes: [],
  sponsored_bills: [],
  sponsored_bills_total: 0,
  member_votes_available: true,
  as_of: '2026-07-20T00:00:00.000Z',
}


function Opener({ seed, label }: { seed: MemberProfileSeed; label: string }) {
  const open = useOpenMemberProfile()
  return (
    <button type="button" onClick={() => open(seed)}>
      {label}
    </button>
  )
}

afterEach(() => {
  vi.clearAllMocks()
  clearMemberProfileCache()
  document.body.style.overflow = ''
})

describe('MemberProfileProvider', () => {
  it('renders a single profile sheet shared by multiple openers', async () => {
    fetchMemberProfileMock.mockImplementation(async (id: string) =>
      id === seedB.bioguide_id
        ? {
            ...profileA,
            bioguide_id: seedB.bioguide_id,
            name: seedB.name,
            party: seedB.party,
            state: seedB.state,
            district: 12,
          }
        : profileA,
    )

    render(
      <MemberProfileProvider>
        <Opener seed={seedA} label="Open A" />
        <Opener seed={seedB} label="Open B" />
      </MemberProfileProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open A' }))
    await screen.findByRole('dialog', { name: 'Brian Fitzpatrick' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect((await screen.findByRole('dialog', { name: 'Brian Fitzpatrick' }))).toBeInTheDocument()

    // The open modal hides the page behind it from assistive tech, so reach the second opener with hidden: true.
    fireEvent.click(screen.getByRole('button', { name: 'Open B', hidden: true }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect((await screen.findByRole('dialog', { name: 'Grace Other' }))).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('CA-12')).toBeInTheDocument()
    })
  })

  it('re-selecting the same member bumps selectionKey and cancels a pending close', async () => {
    fetchMemberProfileMock.mockResolvedValue(profileA)

    render(
      <MemberProfileProvider>
        <Opener seed={seedA} label="Open A" />
      </MemberProfileProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open A' }))
    await waitFor(() => {
      expect(screen.getByText('PA-1')).toBeInTheDocument()
    })

    const dialog = (await screen.findByRole('dialog', { name: 'Brian Fitzpatrick' }))
    const exit = holdSheetExit()
    await pressEscapeIn(dialog)
    await waitFor(() => expect(dialog).toHaveAttribute('inert'))

    fireEvent.click(screen.getByRole('button', { name: 'Open A', hidden: true }))
    exit.finish()
    await waitFor(() => expect(dialog).not.toHaveAttribute('inert'))
    expect((await screen.findByRole('dialog', { name: 'Brian Fitzpatrick' }))).toBeInTheDocument()
  })

  it('throws when the opener hook is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Opener seed={seedA} label="Open A" />)).toThrow(
      /useOpenMemberProfile must be used within MemberProfileProvider/,
    )
    spy.mockRestore()
  })
})

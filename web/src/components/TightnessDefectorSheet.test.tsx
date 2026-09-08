import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

function endAnimation(element: HTMLElement, animationName: string) {
  const event = new Event('animationend', { bubbles: true })
  Object.defineProperty(event, 'animationName', { value: animationName })
  fireEvent(element, event)
}

import { clearMemberProfileCache } from '../api/memberProfileCache'
import { makeTightnessDot } from '../test/tightnessFixtures'
import { resetSheetLayerForTests } from '../utils/sheetLayer'

vi.mock('../api/client', () => ({
  fetchVoteDefectors: vi.fn(),
  fetchMemberProfile: vi.fn(),
}))

import { fetchMemberProfile, fetchVoteDefectors } from '../api/client'
import { clearRollDefectorsCache } from '../api/rollDefectorsCache'
import { renderWithMemberProfile } from '../test/memberProfileHarness'
import { TightnessDefectorSheet } from './TightnessDefectorSheet'

const fetchVoteDefectorsMock = vi.mocked(fetchVoteDefectors)

describe('TightnessDefectorSheet', () => {
  afterEach(() => {
    vi.clearAllMocks()
    clearMemberProfileCache()
    clearRollDefectorsCache()
    resetSheetLayerForTests()
    document.body.style.overflow = ''
  })

  it('loads vote-level defectors into a dialog, not a hover card', async () => {
    fetchVoteDefectorsMock.mockResolvedValue({
      chamber: 'House',
      congress: 119,
      session: 2,
      roll_number: 9010,
      defectors: [
        {
          bioguide_id: 'LOCAL:H001',
          name: 'Rep. Sample Crossover (local)',
          party: 'D',
          state: 'CA',
          position: 'yea',
          party_line: 'nay',
          congress_gov_url: null,
        },
      ],
      party_splits: [
        { party: 'R', yeas: 207, nays: 5, party_line: 'yea' },
        { party: 'D', yeas: 2, nays: 203, party_line: 'nay' },
      ],
      member_votes_available: true,
      as_of: '2026-07-23T00:00:00.000Z',
    })

    renderWithMemberProfile(
      <TightnessDefectorSheet
        open
        dot={makeTightnessDot()}
        selectionKey={1}
        onClose={() => {}}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'H.R. 88' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Who broke with their party' })).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchVoteDefectorsMock).toHaveBeenCalledWith({
        chamber: 'House',
        congress: 119,
        session: 2,
        rollNumber: 9010,
      })
      expect(screen.getByText('Rep. Sample Crossover (local)')).toBeInTheDocument()
    })
  })

  it('opens the member profile on top of the defector sheet when a name is clicked', async () => {
    fetchVoteDefectorsMock.mockResolvedValue({
      chamber: 'House',
      congress: 119,
      session: 2,
      roll_number: 9010,
      defectors: [
        {
          bioguide_id: 'LOCAL:H001',
          name: 'Rep. Sample Crossover (local)',
          party: 'D',
          state: 'CA',
          position: 'yea',
          party_line: 'nay',
          congress_gov_url: null,
        },
      ],
      party_splits: [
        { party: 'R', yeas: 207, nays: 5, party_line: 'yea' },
        { party: 'D', yeas: 2, nays: 203, party_line: 'nay' },
      ],
      member_votes_available: true,
      as_of: '2026-07-23T00:00:00.000Z',
    })
    vi.mocked(fetchMemberProfile).mockResolvedValue({
      bioguide_id: 'LOCAL:H001',
      name: 'Rep. Sample Crossover (local)',
      chamber: 'House',
      party: 'D',
      state: 'CA',
      district: 12,
      photo_url: '',
      congress_gov_url: null,
      congress: 119,
      session: 2,
      votes_cast: 10,
      yea_count: 4,
      nay_count: 6,
      cross_vote_count: 3,
      cross_vote_label: 'occasional',
      recent_cross_votes: [],
      sponsored_bills: [],
      sponsored_bills_total: 0,
      member_votes_available: true,
      as_of: '2026-07-20T00:00:00.000Z',
    })

    renderWithMemberProfile(
      <TightnessDefectorSheet
        open
        dot={makeTightnessDot()}
        selectionKey={1}
        onClose={() => {}}
      />,
    )

    const trigger = await screen.findByRole('button', {
      name: 'Open profile for Rep. Sample Crossover (local)',
    })
    trigger.focus()
    fireEvent.click(trigger)

    const profile = screen.getByRole('dialog', { name: 'Rep. Sample Crossover (local)' })
    expect(profile).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'H.R. 88', hidden: true })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('CA-12')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    endAnimation(profile, 'sheet-sink')

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Rep. Sample Crossover (local)' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByRole('dialog', { name: 'H.R. 88' })).toBeInTheDocument()
    await waitFor(() => {
      expect(trigger).toHaveFocus()
    })
  })
})

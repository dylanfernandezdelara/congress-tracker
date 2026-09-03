import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeTightnessDot } from '../test/tightnessFixtures'
import { resetSheetLayerForTests } from '../utils/sheetLayer'

vi.mock('../api/client', () => ({
  fetchVoteDefectors: vi.fn(),
}))

import { fetchVoteDefectors } from '../api/client'
import { clearRollDefectorsCache } from '../api/rollDefectorsCache'
import { TightnessDefectorSheet } from './TightnessDefectorSheet'

const fetchVoteDefectorsMock = vi.mocked(fetchVoteDefectors)

describe('TightnessDefectorSheet', () => {
  afterEach(() => {
    vi.clearAllMocks()
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

    render(
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
})

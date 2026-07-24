import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearRollDefectorsCache } from '../api/rollDefectorsCache'
import { makeFeedItem } from '../test/feedItemFixtures'
import { FeedRowDetail } from './FeedRowDetail'

vi.mock('../api/client', () => ({
  fetchVoteDefectors: vi.fn(),
}))

import { fetchVoteDefectors } from '../api/client'

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  clearRollDefectorsCache()
})

describe('FeedRowDetail', () => {
  it('shows party defectors for an expanded vote when member data exists', async () => {
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: true,
      defectors: [
        {
          bioguide_id: 'LOCAL:S001',
          name: 'Sen. Sample Crossover (local)',
          party: 'R',
          state: 'TX',
          position: 'nay',
          party_line: 'yea',
          congress_gov_url: 'https://www.congress.gov/member/local:s001',
        },
      ],
    })

    render(<FeedRowDetail item={makeFeedItem()} />)

    await waitFor(() => {
      expect(screen.getByText('Sen. Sample Crossover (local)')).toBeInTheDocument()
    })
    expect(screen.getByText(/voted Nay \(party Yea\)/)).toBeInTheDocument()
  })

  it('shows an empty state when no members broke with their party', async () => {
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: true,
      defectors: [],
    })

    render(<FeedRowDetail item={makeFeedItem()} />)

    await waitFor(() => {
      expect(screen.getByText(/No members broke with their party/)).toBeInTheDocument()
    })
  })

  it('shows unavailable copy when member votes were not ingested', async () => {
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: false,
      defectors: [],
    })

    render(<FeedRowDetail item={makeFeedItem()} />)

    await waitFor(() => {
      expect(screen.getByText('Member-level votes not available yet.')).toBeInTheDocument()
    })
  })

  it('shows unavailable copy when roll call keys are missing', () => {
    render(
      <FeedRowDetail
        item={makeFeedItem({
          passage_votes: [
            {
              chamber: 'Senate',
              question: 'On Passage of the Bill',
              result: 'Passed',
              yeas: 52,
              nays: 47,
              date: '2026-06-05',
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('Member-level votes not available yet.')).toBeInTheDocument()
  })

  it('copies a shareable bill link to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: false,
      defectors: [],
    })

    render(<FeedRowDetail item={makeFeedItem()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied).toContain('bill=119-s-2')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})

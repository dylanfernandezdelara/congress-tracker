import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FeedPassageVote, VoteDefectorsResponse } from '../api/types'

vi.mock('../api/client', () => ({
  fetchVoteDefectors: vi.fn(),
}))

import { fetchVoteDefectors } from '../api/client'
import { clearRollDefectorsCache } from '../api/rollDefectorsCache'
import { useRollDefectors, voteRollKey } from './useRollDefectors'

const fetchVoteDefectorsMock = vi.mocked(fetchVoteDefectors)

const vote: FeedPassageVote = {
  chamber: 'Senate',
  congress: 119,
  session: 2,
  roll_number: 9002,
  question: 'On Passage of the Bill',
  result: 'Passed',
  yeas: 52,
  nays: 47,
  date: '2026-06-05',
}

const response = {
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
} satisfies VoteDefectorsResponse

afterEach(() => {
  vi.clearAllMocks()
  clearRollDefectorsCache()
})

describe('useRollDefectors', () => {
  it('fetches once for a roll and does not refetch on a second mount', async () => {
    fetchVoteDefectorsMock.mockResolvedValue(response)
    const key = voteRollKey(vote)
    expect(key).toBeTruthy()
    // Stable reference: the effect depends on `votes` identity.
    const votes = [vote]

    const first = renderHook(() => useRollDefectors(votes))
    await waitFor(() => {
      expect(first.result.current.get(key!)?.status).toBe('ready')
    })
    expect(fetchVoteDefectorsMock).toHaveBeenCalledTimes(1)
    first.unmount()

    const second = renderHook(() => useRollDefectors(votes))
    await waitFor(() => {
      expect(second.result.current.get(key!)?.status).toBe('ready')
    })
    expect(fetchVoteDefectorsMock).toHaveBeenCalledTimes(1)
    expect(second.result.current.get(key!)).toEqual({
      status: 'ready',
      defectors: response.defectors,
    })
    second.unmount()
  })
})

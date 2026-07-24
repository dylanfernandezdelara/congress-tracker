import { afterEach, describe, expect, it, vi } from 'vitest'

import type { VoteDefectorsResponse } from './types'

vi.mock('./client', () => ({
  fetchVoteDefectors: vi.fn(),
}))

import { fetchVoteDefectors } from './client'
import {
  clearRollDefectorsCache,
  getCachedRollDefectors,
  loadRollDefectors,
} from './rollDefectorsCache'

const fetchVoteDefectorsMock = vi.mocked(fetchVoteDefectors)

const roll = {
  chamber: 'Senate' as const,
  congress: 119,
  session: 2,
  rollNumber: 9002,
}

const response = {
  chamber: 'Senate',
  congress: 119,
  session: 2,
  roll_number: 9002,
  as_of: '2026-06-05T00:00:00.000Z',
  member_votes_available: true,
  defectors: [],
} satisfies VoteDefectorsResponse

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.clearAllMocks()
  clearRollDefectorsCache()
})

describe('rollDefectorsCache', () => {
  it('de-dupes concurrent loads and caches the resolved response', async () => {
    fetchVoteDefectorsMock.mockResolvedValue(response)

    const [first, second] = await Promise.all([
      loadRollDefectors(roll),
      loadRollDefectors(roll),
    ])

    expect(fetchVoteDefectorsMock).toHaveBeenCalledTimes(1)
    expect(first).toBe(response)
    expect(second).toBe(response)
    expect(getCachedRollDefectors(roll)).toBe(response)
  })

  it('does not cache failures, so the next load retries', async () => {
    fetchVoteDefectorsMock.mockRejectedValueOnce(new Error('down'))
    fetchVoteDefectorsMock.mockResolvedValueOnce(response)

    await expect(loadRollDefectors(roll)).rejects.toThrow('down')
    expect(getCachedRollDefectors(roll)).toBeNull()

    await expect(loadRollDefectors(roll)).resolves.toBe(response)
    expect(fetchVoteDefectorsMock).toHaveBeenCalledTimes(2)
  })

  it('ignores in-flight resolutions that settle after the cache is cleared', async () => {
    const pending = deferred<VoteDefectorsResponse>()
    fetchVoteDefectorsMock.mockReturnValueOnce(pending.promise)

    const load = loadRollDefectors(roll)
    clearRollDefectorsCache()
    pending.resolve(response)
    await load

    expect(getCachedRollDefectors(roll)).toBeNull()
  })
})

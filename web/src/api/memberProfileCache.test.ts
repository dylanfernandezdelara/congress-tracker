import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MemberProfileResponse } from './types'

vi.mock('./client', () => ({
  fetchMemberProfile: vi.fn(),
}))

import { fetchMemberProfile } from './client'
import {
  clearMemberProfileCache,
  getCachedMemberProfile,
  loadMemberProfile,
} from './memberProfileCache'

const fetchMemberProfileMock = vi.mocked(fetchMemberProfile)

const profile = { bioguide_id: 'F000466', name: 'Brian Fitzpatrick' } as MemberProfileResponse

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
  clearMemberProfileCache()
})

describe('memberProfileCache', () => {
  it('de-dupes concurrent loads and caches the resolved profile', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)

    const [first, second] = await Promise.all([
      loadMemberProfile('F000466'),
      loadMemberProfile('F000466'),
    ])

    expect(fetchMemberProfileMock).toHaveBeenCalledTimes(1)
    expect(first).toBe(profile)
    expect(second).toBe(profile)
    expect(getCachedMemberProfile('F000466')).toBe(profile)
  })

  it('does not cache failures, so the next load retries', async () => {
    fetchMemberProfileMock.mockRejectedValueOnce(new Error('down'))
    fetchMemberProfileMock.mockResolvedValueOnce(profile)

    await expect(loadMemberProfile('F000466')).rejects.toThrow('down')
    expect(getCachedMemberProfile('F000466')).toBeNull()

    await expect(loadMemberProfile('F000466')).resolves.toBe(profile)
    expect(fetchMemberProfileMock).toHaveBeenCalledTimes(2)
  })

  it('ignores in-flight resolutions that settle after the cache is cleared', async () => {
    const pending = deferred<MemberProfileResponse>()
    fetchMemberProfileMock.mockReturnValueOnce(pending.promise)

    const load = loadMemberProfile('F000466')
    clearMemberProfileCache()
    pending.resolve(profile)
    await load

    expect(getCachedMemberProfile('F000466')).toBeNull()
  })
})

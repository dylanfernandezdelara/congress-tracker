import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MemberProfileResponse } from '../api/types'

vi.mock('../api/client', () => ({
  fetchMemberProfile: vi.fn(),
}))

import { fetchMemberProfile } from '../api/client'
import { clearMemberProfileCache, loadMemberProfile } from '../api/memberProfileCache'
import { useMemberProfile } from './useMemberProfile'

const fetchMemberProfileMock = vi.mocked(fetchMemberProfile)

const profile = { bioguide_id: 'F000466', name: 'Brian Fitzpatrick' } as MemberProfileResponse

afterEach(() => {
  vi.clearAllMocks()
  clearMemberProfileCache()
})

describe('useMemberProfile', () => {
  it('returns a prefetched profile synchronously with no pending state', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)
    await loadMemberProfile('F000466')

    const { result } = renderHook(() => useMemberProfile('F000466'))

    expect(result.current.profile).toBe(profile)
    expect(result.current.isPending).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('is pending until the fetch settles, then exposes the profile', async () => {
    fetchMemberProfileMock.mockResolvedValue(profile)

    const { result } = renderHook(() => useMemberProfile('F000466'))

    expect(result.current.profile).toBeNull()
    expect(result.current.isPending).toBe(true)

    await waitFor(() => {
      expect(result.current.profile).toBe(profile)
    })
    expect(result.current.isPending).toBe(false)
  })

  it('never surfaces another member’s error: switching ids resets to pending', async () => {
    fetchMemberProfileMock.mockRejectedValueOnce(new Error('down'))
    const pendingB = new Promise<MemberProfileResponse>(() => undefined)
    fetchMemberProfileMock.mockReturnValueOnce(pendingB)

    const { result, rerender } = renderHook(({ id }: { id: string }) => useMemberProfile(id), {
      initialProps: { id: 'A000001' },
    })

    await waitFor(() => {
      expect(result.current.error).toBe('down')
    })
    expect(result.current.isPending).toBe(false)

    rerender({ id: 'B000002' })

    expect(result.current.error).toBeNull()
    expect(result.current.profile).toBeNull()
    expect(result.current.isPending).toBe(true)
  })

  it('returns idle state for a null id', () => {
    const { result } = renderHook(() => useMemberProfile(null))

    expect(result.current.profile).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isPending).toBe(false)
    expect(fetchMemberProfileMock).not.toHaveBeenCalled()
  })
})

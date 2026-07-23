import { useEffect, useState } from 'react'

import { getCachedMemberProfile, loadMemberProfile } from '../api/memberProfileCache'
import type { MemberProfileResponse } from '../api/types'

type UseMemberProfileResult = {
  /** Synchronous cache read for the requested member; prefetched data renders on the first frame. */
  profile: MemberProfileResponse | null
  /** Fetch error for the requested member only; another member's error never leaks in. */
  error: string | null
  /** True until the fetch for the requested member has settled (cache hit or error). */
  isPending: boolean
}

type SettledState = {
  bioguideId: string
  error: string | null
}

/* Cache-aware member profile loader: the memberProfileCache is the single
   data source, and this hook drives the fetch and re-renders when it settles.
   All returned state is scoped to the requested bioguideId, so switching
   members can never show a stale profile, error, or loading flag. */
export function useMemberProfile(bioguideId: string | null): UseMemberProfileResult {
  const [settled, setSettled] = useState<SettledState | null>(null)

  useEffect(() => {
    if (!bioguideId) return
    let cancelled = false
    loadMemberProfile(bioguideId)
      .then(() => {
        if (!cancelled) setSettled({ bioguideId, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSettled({
            bioguideId,
            error: err instanceof Error ? err.message : 'Could not load member profile',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [bioguideId])

  const profile = bioguideId ? getCachedMemberProfile(bioguideId) : null
  const error = settled?.bioguideId === bioguideId ? settled.error : null
  const isPending = bioguideId !== null && profile === null && error === null

  return { profile, error, isPending }
}

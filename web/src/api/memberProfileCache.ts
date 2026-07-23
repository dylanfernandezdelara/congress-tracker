import { fetchMemberProfile } from './client'
import type { MemberProfileResponse } from './types'

/* Session-lived cache so the member profile sheet opens with data already in
   hand (defector profiles are prefetched when the Notable votes section
   renders). Underlying stats change at most daily, so no invalidation is
   needed within a page session. */
const resolvedProfiles = new Map<string, MemberProfileResponse>()
const inflightProfiles = new Map<string, Promise<MemberProfileResponse>>()

/** Synchronous lookup used to render already-fetched stats without a loading frame. */
export function getCachedMemberProfile(bioguideId: string): MemberProfileResponse | null {
  return resolvedProfiles.get(bioguideId) ?? null
}

/** Cache-first fetch with in-flight de-duplication; failures are not cached, so retries refetch. */
export function loadMemberProfile(bioguideId: string): Promise<MemberProfileResponse> {
  const cached = resolvedProfiles.get(bioguideId)
  if (cached) return Promise.resolve(cached)

  const pending = inflightProfiles.get(bioguideId)
  if (pending) return pending

  const request = fetchMemberProfile(bioguideId)
    .then((profile) => {
      resolvedProfiles.set(bioguideId, profile)
      return profile
    })
    .finally(() => {
      inflightProfiles.delete(bioguideId)
    })
  inflightProfiles.set(bioguideId, request)
  return request
}

/** Best-effort warm-up; errors are swallowed because opening the profile retries the fetch. */
export function prefetchMemberProfile(bioguideId: string): void {
  loadMemberProfile(bioguideId).catch(() => undefined)
}

/** Test-only helper to keep cached profiles from leaking between test cases. */
export function clearMemberProfileCache(): void {
  resolvedProfiles.clear()
  inflightProfiles.clear()
}

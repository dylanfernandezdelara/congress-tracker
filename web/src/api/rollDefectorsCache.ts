import { fetchVoteDefectors } from './client'
import type { VoteDefectorsResponse } from './types'

export type RollDefectorsKey = {
  chamber: 'House' | 'Senate'
  congress: number
  session: number
  rollNumber: number
}

/* Session-lived cache so expanding a feed row again does not re-hit
   /feed/vote-defectors.json for the same roll. Member-level rolls change at
   most with daily ingest, so no invalidation is needed within a page session. */
const resolvedRolls = new Map<string, VoteDefectorsResponse>()
const inflightRolls = new Map<string, Promise<VoteDefectorsResponse>>()

/* Bumped by clearRollDefectorsCache so requests that were in flight when the
   cache was cleared cannot repopulate it after the fact. */
let cacheGeneration = 0

export function rollDefectorsCacheKey(params: RollDefectorsKey): string {
  return `${params.chamber}:${params.congress}:${params.session}:${params.rollNumber}`
}

/** Synchronous lookup used to skip a loading frame for already-fetched rolls. */
export function getCachedRollDefectors(params: RollDefectorsKey): VoteDefectorsResponse | null {
  return resolvedRolls.get(rollDefectorsCacheKey(params)) ?? null
}

/** Cache-first fetch with in-flight de-duplication; failures are not cached, so retries refetch. */
export function loadRollDefectors(params: RollDefectorsKey): Promise<VoteDefectorsResponse> {
  const key = rollDefectorsCacheKey(params)
  const cached = resolvedRolls.get(key)
  if (cached) return Promise.resolve(cached)

  const pending = inflightRolls.get(key)
  if (pending) return pending

  const generation = cacheGeneration
  const request = fetchVoteDefectors(params)
    .then((response) => {
      if (generation === cacheGeneration) resolvedRolls.set(key, response)
      return response
    })
    .finally(() => {
      /* Only remove our own entry: a clear plus a newer request for the same
         key must not have its in-flight entry deleted by this stale settle. */
      if (inflightRolls.get(key) === request) inflightRolls.delete(key)
    })
  inflightRolls.set(key, request)
  return request
}

/** Test-only helper to keep cached rolls from leaking between test cases. */
export function clearRollDefectorsCache(): void {
  cacheGeneration += 1
  resolvedRolls.clear()
  inflightRolls.clear()
}

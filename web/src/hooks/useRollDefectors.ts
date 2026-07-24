import { useEffect, useState } from 'react'

import { getCachedRollDefectors, loadRollDefectors } from '../api/rollDefectorsCache'
import type { FeedPassageVote, VoteDefectorEntry } from '../api/types'

export type RollDefectorsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; defectors: VoteDefectorEntry[] }
  | { status: 'unavailable' }
  | { status: 'error' }

export function voteRollKey(vote: FeedPassageVote): string | null {
  if (
    vote.congress === undefined ||
    vote.session === undefined ||
    vote.roll_number === undefined
  ) {
    return null
  }
  return `${vote.chamber}:${vote.congress}:${vote.session}:${vote.roll_number}`
}

function stateFromResponse(
  response: Awaited<ReturnType<typeof loadRollDefectors>>,
): RollDefectorsState {
  if (!response.member_votes_available) {
    return { status: 'unavailable' }
  }
  return {
    status: 'ready',
    defectors: response.defectors,
  }
}

/**
 * Loads party-defector lists for each passage vote that has a complete roll-call key.
 * Cancel-safe: in-flight updates are dropped after unmount / vote-list change.
 * Session-cached via rollDefectorsCache so collapse/re-expand does not refetch.
 */
export function useRollDefectors(
  votes: FeedPassageVote[],
): Map<string, RollDefectorsState> {
  const [defectorsByRoll, setDefectorsByRoll] = useState<Map<string, RollDefectorsState>>(
    () => new Map(),
  )

  useEffect(() => {
    let cancelled = false
    const rollKeys = votes
      .map((vote) => {
        const key = voteRollKey(vote)
        if (
          !key ||
          vote.congress === undefined ||
          vote.session === undefined ||
          vote.roll_number === undefined
        ) {
          return null
        }
        return {
          key,
          params: {
            chamber: vote.chamber,
            congress: vote.congress,
            session: vote.session,
            rollNumber: vote.roll_number,
          },
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (rollKeys.length === 0) {
      setDefectorsByRoll(new Map())
      return
    }

    setDefectorsByRoll(() => {
      const next = new Map<string, RollDefectorsState>()
      for (const { key, params } of rollKeys) {
        const cached = getCachedRollDefectors(params)
        next.set(key, cached ? stateFromResponse(cached) : { status: 'loading' })
      }
      return next
    })

    void Promise.all(
      rollKeys.map(async ({ key, params }) => {
        try {
          const response = await loadRollDefectors(params)
          if (cancelled) return
          setDefectorsByRoll((current) => {
            const next = new Map(current)
            next.set(key, stateFromResponse(response))
            return next
          })
        } catch {
          if (cancelled) return
          setDefectorsByRoll((current) => {
            const next = new Map(current)
            next.set(key, { status: 'error' })
            return next
          })
        }
      }),
    )

    return () => {
      cancelled = true
    }
  }, [votes])

  return defectorsByRoll
}

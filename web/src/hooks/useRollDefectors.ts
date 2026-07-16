import { useEffect, useState } from 'react'

import { fetchVoteDefectors } from '../api/client'
import type { FeedPassageVote, VoteDefectorEntry } from '../api/types'

export type RollDefectorsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; defectors: VoteDefectorEntry[]; memberVotesAvailable: boolean }
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

/**
 * Loads party-defector lists for each passage vote that has a complete roll-call key.
 * Cancel-safe: in-flight updates are dropped after unmount / vote-list change.
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
          vote,
          congress: vote.congress,
          session: vote.session,
          rollNumber: vote.roll_number,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (rollKeys.length === 0) {
      setDefectorsByRoll(new Map())
      return
    }

    setDefectorsByRoll((current) => {
      const next = new Map<string, RollDefectorsState>()
      for (const { key } of rollKeys) {
        const existing = current.get(key)
        next.set(key, existing?.status === 'ready' ? existing : { status: 'loading' })
      }
      return next
    })

    void Promise.all(
      rollKeys.map(async ({ key, vote, congress, session, rollNumber }) => {
        try {
          const response = await fetchVoteDefectors({
            chamber: vote.chamber,
            congress,
            session,
            rollNumber,
          })
          if (cancelled) return
          setDefectorsByRoll((current) => {
            const next = new Map(current)
            next.set(key, {
              status: 'ready',
              defectors: response.defectors,
              memberVotesAvailable: response.member_votes_available,
            })
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

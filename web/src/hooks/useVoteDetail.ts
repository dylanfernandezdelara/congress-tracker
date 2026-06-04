import { useEffect, useState } from 'react'
import { fetchVoteDetail, type VoteDetailResponse } from '../api'
import { E2E_VOTE_DETAILS } from '../e2eData'
import { normalizeErrorMessage } from '../utils/errors'
import { useE2eMode } from './useE2eMode'

export function useVoteDetail(
  congress: string | undefined,
  session: string | undefined,
  voteNumber: string | undefined,
): {
  detail: VoteDetailResponse | null
  error: string | null
  isLoading: boolean
} {
  const e2eMode = useE2eMode()
  const [detail, setDetail] = useState<VoteDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)

      if (!congress || !session || !voteNumber) {
        setError('Missing vote identifier.')
        setIsLoading(false)
        return
      }

      if (e2eMode) {
        const fixture = E2E_VOTE_DETAILS[`${congress}:${session}:${voteNumber}`]
        if (!cancelled) {
          setDetail(fixture ?? null)
          setError(fixture ? null : 'No fixture detail exists for this vote.')
          setIsLoading(false)
        }
        return
      }

      try {
        const result = await fetchVoteDetail(congress, session, voteNumber)
        if (cancelled) return
        setDetail(result)
      } catch (err) {
        if (cancelled) return
        setDetail(null)
        setError(`Vote detail unavailable. ${normalizeErrorMessage(err)}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [congress, e2eMode, session, voteNumber])

  return { detail, error, isLoading }
}

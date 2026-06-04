import { fetchVoteDetail, type VoteDetailResponse } from '../api'
import { normalizeErrorMessage } from '../utils/errors'
import { useAsyncData } from './useAsyncData'

export function useVoteDetail(
  congress: string | undefined,
  session: string | undefined,
  voteNumber: string | undefined,
): {
  detail: VoteDetailResponse | null
  error: string | null
  isLoading: boolean
} {
  const { data, error, isLoading } = useAsyncData({
    deps: [congress, session, voteNumber],
    validate: () => {
      if (!congress || !session || !voteNumber) {
        return 'Missing vote identifier.'
      }
      return null
    },
    load: () => fetchVoteDetail(congress!, session!, voteNumber!),
    mapError: (err) => `Vote detail unavailable. ${normalizeErrorMessage(err)}`,
  })

  return { detail: data, error, isLoading }
}

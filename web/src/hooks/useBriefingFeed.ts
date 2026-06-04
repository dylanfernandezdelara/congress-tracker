import { fetchLatestBriefing, type BriefingFeedResponse } from '../api'
import { normalizeErrorMessage } from '../utils/errors'
import { useAsyncData } from './useAsyncData'

export function useBriefingFeed(): {
  briefing: BriefingFeedResponse | null
  error: string | null
  isLoading: boolean
} {
  const { data, error, isLoading } = useAsyncData({
    deps: [],
    load: fetchLatestBriefing,
    mapError: (err) => `Live briefing unavailable. ${normalizeErrorMessage(err)}`,
  })

  return { briefing: data, error, isLoading }
}

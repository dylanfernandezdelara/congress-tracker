/**
 * API client for the current product UI (briefing feed and vote detail).
 */

import { ApiError, fetchJson } from './fetchJson'
import type { BriefingFeedResponse, VoteDetailResponse } from './types'

export { ApiError }

export async function fetchLatestBriefing(): Promise<BriefingFeedResponse> {
  return fetchJson<BriefingFeedResponse>('/briefings/latest.json')
}

export async function fetchVoteDetail(
  congress: number | string,
  session: number | string,
  voteNumber: number | string,
): Promise<VoteDetailResponse> {
  return fetchJson<VoteDetailResponse>(`/votes/${congress}/${session}/${voteNumber}.json`)
}

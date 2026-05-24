/**
 * API client for fetching Senate voting data.
 */

import { ApiError, fetchJson } from './fetchJson'
import type {
  ActivityIndexResponse,
  BriefingFeedResponse,
  HealthResponse,
  MemberActivityResponse,
  MemberIndexResponse,
  SessionOverview,
  StateMetaResponse,
  StateVotesResponse,
  VoteDetailResponse,
  VoteLedger,
} from './types'

export { ApiError }

export async function fetchMembersIndex(): Promise<MemberIndexResponse> {
  return fetchJson<MemberIndexResponse>('/members/index.json')
}

export async function fetchActivitiesIndex(): Promise<ActivityIndexResponse> {
  return fetchJson<ActivityIndexResponse>('/activities/index.json')
}

export async function fetchMemberLatest(bioguideId: string): Promise<MemberActivityResponse> {
  return fetchJson<MemberActivityResponse>(`/member/${bioguideId}/latest.json`)
}

export async function fetchStateLatest(state: string): Promise<StateVotesResponse> {
  return fetchJson<StateVotesResponse>(`/state/${state.toUpperCase()}/latest.json`)
}

export async function fetchStateMeta(state: string): Promise<StateMetaResponse> {
  return fetchJson<StateMetaResponse>(`/state/${state.toUpperCase()}/_meta.json`)
}

export async function fetchStateSnapshot(state: string, date: string): Promise<StateVotesResponse> {
  return fetchJson<StateVotesResponse>(`/state/${state.toUpperCase()}/${date}.json`)
}

export async function fetchHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/health')
}

export async function fetchDataHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/health/data')
}

export async function fetchVoteLedger(): Promise<VoteLedger> {
  return fetchJson<VoteLedger>('/votes/ledger.json')
}

export async function fetchSessionOverview(): Promise<SessionOverview> {
  return fetchJson<SessionOverview>('/stats/overview.json')
}

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

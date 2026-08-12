import type { IngestMonitorPayload } from '@congress-tracker/shared/ingest-api-types'

import { applyAdvancedFeedParams, type AdvancedFeedFilters } from '../utils/feedAdvancedFilters'
import { fetchJson } from './fetchJson'
import type {
  AdvancingBillsResponse,
  CommitteesLeaderboardResponse,
  DefectorsResponse,
  FeedPageResponse,
  MemberProfileResponse,
  MembersSearchResponse,
  NotableVotesResponse,
  PolicyAreasResponse,
  PortfoliosResponse,
  PulseStatsResponse,
  RecentConfirmationsResponse,
  RecentLawsResponse,
  SessionStatsResponse,
  StatsChamber,
  VoteDefectorsResponse,
} from './types'

export interface HealthResponse {
  status: string
  timestamp: string
  congress: string
  session: string
  data?: {
    ingest?: IngestMonitorPayload
    error?: string
  }
}

export interface IngestMonitorResponse {
  as_of: string
  ingest: IngestMonitorPayload
  alerting: {
    cloudflare_logs: string
    external_monitor: string
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/health')
}

export async function fetchIngestMonitor(): Promise<IngestMonitorResponse> {
  return fetchJson<IngestMonitorResponse>('/debug/ingest.json')
}

export async function fetchFeed(options: {
  limit: number
  offset: number
  chamber?: 'House' | 'Senate'
  q?: string
} & Partial<AdvancedFeedFilters>): Promise<FeedPageResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit),
    offset: String(options.offset),
  })
  if (options.chamber) {
    params.set('chamber', options.chamber)
  }
  const q = options.q?.trim()
  if (q) {
    params.set('q', q)
  }
  applyAdvancedFeedParams(params, {
    state: options.state ?? null,
    sponsorChamber: options.sponsorChamber ?? null,
    sponsor: options.sponsor ?? null,
    sponsorQ: options.sponsorQ ?? '',
    party: options.party ?? null,
    policy: options.policy ?? null,
  })
  return fetchJson<FeedPageResponse>(`/feed/latest.json?${params}`)
}

export async function fetchMembersSearch(options: {
  q?: string
  chamber?: 'House' | 'Senate'
  state?: string
  limit?: number
}): Promise<MembersSearchResponse> {
  const params = new URLSearchParams()
  const q = options.q?.trim()
  if (q) params.set('q', q)
  if (options.chamber) params.set('chamber', options.chamber)
  if (options.state) params.set('state', options.state)
  if (options.limit != null) params.set('limit', String(options.limit))
  const qs = params.toString()
  return fetchJson<MembersSearchResponse>(`/stats/members.json${qs ? `?${qs}` : ''}`)
}

export async function fetchPolicyAreas(): Promise<PolicyAreasResponse> {
  return fetchJson<PolicyAreasResponse>('/stats/policy-areas.json')
}

export async function fetchSessionStats(): Promise<SessionStatsResponse> {
  return fetchJson<SessionStatsResponse>('/stats/session.json')
}

export async function fetchNotableVotes(limit = 3): Promise<NotableVotesResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  return fetchJson<NotableVotesResponse>(`/stats/notable.json?${params}`)
}

export async function fetchRecentLaws(limit = 5): Promise<RecentLawsResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  return fetchJson<RecentLawsResponse>(`/stats/recent-laws.json?${params}`)
}

export async function fetchRecentConfirmations(
  limit = 5,
): Promise<RecentConfirmationsResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  return fetchJson<RecentConfirmationsResponse>(`/stats/recent-confirmations.json?${params}`)
}

export async function fetchAdvancingBills(limit = 5): Promise<AdvancingBillsResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  return fetchJson<AdvancingBillsResponse>(`/stats/advancing-bills.json?${params}`)
}

export async function fetchCommitteesLeaderboard(
  chamber: StatsChamber,
): Promise<CommitteesLeaderboardResponse> {
  const params = new URLSearchParams({ chamber })
  return fetchJson<CommitteesLeaderboardResponse>(`/stats/committees.json?${params}`)
}

export async function fetchPulseStats(): Promise<PulseStatsResponse> {
  return fetchJson<PulseStatsResponse>('/stats/pulse.json')
}

export async function fetchDefectors(chamber: 'House' | 'Senate'): Promise<DefectorsResponse> {
  return fetchJson<DefectorsResponse>(`/stats/defectors.json?chamber=${chamber}&limit=5`)
}

export async function fetchPortfolioStats(chamber: 'House' | 'Senate'): Promise<PortfoliosResponse> {
  return fetchJson<PortfoliosResponse>(`/stats/portfolios.json?chamber=${chamber}&limit=5`)
}

export async function fetchVoteDefectors(params: {
  chamber: 'House' | 'Senate'
  congress: number
  session: number
  rollNumber: number
}): Promise<VoteDefectorsResponse> {
  const search = new URLSearchParams({
    chamber: params.chamber,
    congress: String(params.congress),
    session: String(params.session),
    roll_number: String(params.rollNumber),
  })
  return fetchJson<VoteDefectorsResponse>(`/feed/vote-defectors.json?${search}`)
}

export async function fetchMemberProfile(bioguideId: string): Promise<MemberProfileResponse> {
  const params = new URLSearchParams({ bioguide_id: bioguideId })
  return fetchJson<MemberProfileResponse>(`/stats/member.json?${params}`)
}

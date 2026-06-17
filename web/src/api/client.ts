import { fetchJson } from './fetchJson'
import type {
  DefectorsResponse,
  FeedItem,
  PortfoliosResponse,
  PulseStatsResponse,
  SessionStatsResponse,
} from './types'

export interface HealthResponse {
  status: string
  timestamp: string
  congress: string
  session: string
}

export async function fetchHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/health')
}

export async function fetchFeed(): Promise<FeedItem[]> {
  return fetchJson<FeedItem[]>('/feed/latest.json')
}

export async function fetchSessionStats(): Promise<SessionStatsResponse> {
  return fetchJson<SessionStatsResponse>('/stats/session.json')
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

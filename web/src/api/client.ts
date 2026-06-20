import { fetchJson } from './fetchJson'
import type {
  DefectorsResponse,
  FeedPageResponse,
  GameRevealResponse,
  GameRoundsResponse,
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

export async function fetchFeed(options: { limit: number; offset: number }): Promise<FeedPageResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit),
    offset: String(options.offset),
  })
  return fetchJson<FeedPageResponse>(`/feed/latest.json?${params}`)
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

export async function fetchGameRounds(limit = 20): Promise<GameRoundsResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  return fetchJson<GameRoundsResponse>(`/game/rounds.json?${params}`)
}

export async function fetchGameReveal(id: string): Promise<GameRevealResponse> {
  const params = new URLSearchParams({ id })
  return fetchJson<GameRevealResponse>(`/game/reveal.json?${params}`)
}

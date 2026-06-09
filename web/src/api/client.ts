import { fetchJson } from './fetchJson'
import type { FeedItem } from './types'

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

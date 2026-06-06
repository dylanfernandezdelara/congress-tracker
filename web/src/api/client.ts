import { fetchJson } from './fetchJson'

export interface HealthResponse {
  status: string
  timestamp: string
  target_state: string
  congress: string
  session: string
}

export async function fetchHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/health')
}

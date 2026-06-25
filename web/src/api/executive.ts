import type { ExecutiveAlertsResponse } from '../api/types'
import { fetchJson } from '../api/fetchJson'

export function fetchExecutiveAlerts(): Promise<ExecutiveAlertsResponse> {
  return fetchJson<ExecutiveAlertsResponse>('/executive/alerts.json')
}

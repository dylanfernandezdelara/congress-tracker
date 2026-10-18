import type {
  ElectionsIndexResponse,
  ElectionsLocateResponse,
  ElectionsStateResponse,
} from '@congress-tracker/shared/elections-2026/api-types'

import { fetchJson } from './fetchJson'

export function fetchElectionsIndex(): Promise<ElectionsIndexResponse> {
  return fetchJson<ElectionsIndexResponse>('/elections/2026/index.json')
}

export function fetchElectionsLocate(): Promise<ElectionsLocateResponse> {
  return fetchJson<ElectionsLocateResponse>('/elections/2026/locate.json')
}

export function fetchStateGuide(code: string): Promise<ElectionsStateResponse> {
  return fetchJson<ElectionsStateResponse>(`/elections/2026/state/${encodeURIComponent(code)}.json`)
}

/** Response shapes for GET /elections/2026/*.json (worker → web). */

import type { StateElectionGuide } from './types'

export interface ElectionsIndexState {
  code: string
  name: string
  status: StateElectionGuide['status']
  races: number
  competitive: number
}

export interface ElectionsIndexResponse {
  election_day: string
  states: ElectionsIndexState[]
}

export interface ElectionsLocateResponse {
  /** Two-letter code guessed from the visitor's IP; null outside the US or when unknown. */
  state: string | null
}

export type ElectionsStateResponse = StateElectionGuide

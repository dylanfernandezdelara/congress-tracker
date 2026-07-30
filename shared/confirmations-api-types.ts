/** Shared JSON contracts for /stats/recent-confirmations.json — worker + web. */

import type { RollPartySplit } from './stats-api-types'

export interface ConfirmationBackgroundContent {
  headline: string
  what_was_confirmed: string
  /**
   * Official-sourced About blurb (Congress.gov nomination identity / rewrite).
   * Person Wikipedia extracts are preferred in the UI when available.
   */
  background: string
  key_points: string[]
  /**
   * Wikipedia article URL when enrichment found a confident person-page match.
   * `null` means looked up with no match; omit/undefined means not looked up yet.
   */
  wikipedia_url?: string | null
  /** Person-page Wikipedia extract used as preferred About when present. */
  wikipedia_extract?: string | null
}

export interface ConfirmationNominee {
  display_name: string
  state: string | null
}

export interface RecentConfirmationItem {
  chamber: 'Senate'
  congress: number
  session: number
  roll_number: number
  citation: string
  nomination_number: number
  part_number: number
  nominee_names: ConfirmationNominee[]
  position_title: string | null
  organization: string | null
  description: string | null
  question: string
  result: string
  yeas: number
  nays: number
  vote_date: string
  headline: string | null
  what_was_confirmed: string | null
  /**
   * Official Congress.gov-sourced blurb (or honest identity fallback).
   * UI prefers wikipedia_extract for person background when present.
   */
  background: string | null
  key_points: string[]
  congress_gov_url: string
  /** Confident person-page Wikipedia article for the nominee, when found. */
  wikipedia_url: string | null
  /** Person-page Wikipedia extract; preferred About when present. */
  wikipedia_extract: string | null
  /** Per-party yea/nay on this confirmation roll; empty when member votes unavailable. */
  party_splits: RollPartySplit[]
}

export interface RecentConfirmationsResponse {
  congress: number
  session: number
  confirmations: RecentConfirmationItem[]
  as_of: string
}

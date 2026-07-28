/** Shared JSON contracts for /stats/recent-laws.json — worker + web. */

import type { BillLawKind } from './lifecycle-api-types'

export interface RecentLawItem {
  congress: number
  bill_type: string
  bill_number: number
  title: string | null
  policy_area: string | null
  /** Plain-English digest headline when available. */
  headline: string | null
  became_law_date: string
  law_kind: BillLawKind | null
  public_law: string | null
  signed_date: string | null
  presented_date: string | null
  latest_action_date: string | null
  latest_action_text: string | null
}

export interface RecentLawsResponse {
  congress: number
  session: number
  laws: RecentLawItem[]
  as_of: string
}

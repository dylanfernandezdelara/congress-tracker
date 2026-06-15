/** Shared JSON contracts for /stats/* — consumed by worker and web. */

export type StatsChamber = 'House' | 'Senate'

export interface DateRange {
  first: string | null
  last: string | null
}

export interface ChamberStats {
  passage_vote_count: number
  unique_bills_passed: number
  avg_margin: number
  closest_margin: number
  date_range: DateRange
  coverage_days: number
}

export interface SessionStatsResponse {
  congress: number
  session: number
  house: ChamberStats
  senate: ChamberStats
  as_of: string
}

export interface CloseVoteEntry {
  chamber: StatsChamber
  congress: number
  session: number
  roll_number: number
  bill_type: string
  bill_number: number
  yeas: number
  nays: number
  margin: number
  vote_date: string
  headline: string | null
}

export interface PolicyHeatEntry {
  policy_area: string
  bill_count: number
}

export interface ThisWeekSummary {
  count: number
  headline: string | null
  bill_type: string | null
  bill_number: number | null
  congress: number | null
}

export interface ChamberPulse {
  close_votes: CloseVoteEntry[]
  policy_heat: PolicyHeatEntry[]
  this_week: ThisWeekSummary
}

export interface PulseStatsResponse {
  congress: number
  session: number
  house: ChamberPulse
  senate: ChamberPulse
  as_of: string
}

export interface DefectorEntry {
  bioguide_id: string
  name: string
  party: string
  state: string
  cross_vote_count: number
  deciding_score: number
  congress_gov_url: string
  recent_example?: {
    bill_type: string
    bill_number: number
    congress: number
    margin: number
  }
}

export interface DefectorsResponse {
  chamber: StatsChamber
  congress: number
  session: number
  defectors: DefectorEntry[]
  as_of: string
}

export interface PortfolioEntry {
  bioguide_id: string
  name: string
  party: string | null
  state: string | null
  session_return_pct: number
  as_of_date: string
}

export interface PortfolioMovers {
  gainers: PortfolioEntry[]
  losers: PortfolioEntry[]
  disclaimer: string
}

export interface PortfoliosResponse extends PortfolioMovers {
  chamber: StatsChamber
  congress: number
  session: number
  as_of: string
}

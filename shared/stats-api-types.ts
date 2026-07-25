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

export interface PartySeatCount {
  party: string
  seats: number
}

export interface ChamberComposition {
  seats: PartySeatCount[]
  total: number
  majority_party: string | null
  control_label: string
  /** True when roster counts are partial or local sample data — not a full chamber. */
  is_sample?: boolean
  /** One normalized party code per member seat (House/Senate roster order). */
  seat_parties?: string[]
  /** Whether each seat in `seat_parties` is on the ballot this cycle. */
  seat_on_ballot?: boolean[]
  /** Seats on the ballot in the next federal election during this Congress. */
  seats_up_for_election: number
  /** Year of that election (November). */
  election_year: number
}

export interface SessionStatsResponse {
  congress: number
  session: number
  house: ChamberStats
  senate: ChamberStats
  composition: {
    house: ChamberComposition
    senate: ChamberComposition
  }
  as_of: string
}

export type NotableVoteCrossVoteLabel = 'rare' | 'occasional' | 'frequent'

export interface NotableVoteDefector {
  bioguide_id: string
  name: string
  party: string
  state: string
  photo_url: string
  cross_vote_count: number
  cross_vote_label: NotableVoteCrossVoteLabel
}

export interface NotableVoteEntry {
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
  significance_score: number
  why_it_matters: string
  defectors: NotableVoteDefector[]
  /** False when per-member roll-call positions have not been ingested yet. */
  member_votes_available: boolean
}

export interface NotableVotesResponse {
  congress: number
  session: number
  notable: NotableVoteEntry[]
  detection_method: 'heuristic' | 'llm'
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
  /** Null when the id is not a real bioguide (local seed / LIS placeholder). */
  congress_gov_url: string | null
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

/** Member who voted against their party on a single roll call. */
export interface VoteDefectorEntry {
  bioguide_id: string
  name: string
  party: string
  state: string
  position: 'yea' | 'nay'
  party_line: 'yea' | 'nay'
  /** Null when the id is not a real bioguide (local seed / LIS placeholder). */
  congress_gov_url: string | null
}

/** How one party voted on a single roll call. */
export interface RollPartySplit {
  /** Normalized party code: `R`, `D`, `I`, or `Other`. */
  party: string
  yeas: number
  nays: number
  /** Majority side for this party — the line a defector broke from. */
  party_line: 'yea' | 'nay'
}

export interface VoteDefectorsResponse {
  chamber: StatsChamber
  congress: number
  session: number
  roll_number: number
  defectors: VoteDefectorEntry[]
  /** Per-party yea/nay counts, largest caucus first. Empty when votes are unavailable. */
  party_splits: RollPartySplit[]
  /** False when member-level votes were never ingested (or only local samples remain). */
  member_votes_available: boolean
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

export interface MemberProfileRecentCrossVote {
  chamber: StatsChamber
  congress: number
  session: number
  roll_number: number
  bill_type: string
  bill_number: number
  bill_congress: number
  vote_date: string
  position: 'yea' | 'nay'
  party_line: 'yea' | 'nay'
  margin: number
}

export interface MemberProfileResponse {
  bioguide_id: string
  name: string
  chamber: StatsChamber
  party: string
  state: string
  district: number | null
  photo_url: string
  /** Null when the id is not a real bioguide (local seed / LIS placeholder). */
  congress_gov_url: string | null
  congress: number
  session: number
  votes_cast: number
  yea_count: number
  nay_count: number
  cross_vote_count: number
  cross_vote_label: NotableVoteCrossVoteLabel
  recent_cross_votes: MemberProfileRecentCrossVote[]
  member_votes_available: boolean
  as_of: string
}

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
  /** Plain-English lead from the bill digest, when available. */
  what_it_does: string | null
  /** Digest key points (may be empty). */
  key_points: string[]
  /** Official CRS summary text when no digest lead is available. */
  raw_summary_text: string | null
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

export interface CommitteeLeaderboardRow {
  system_code: string
  name: string
  chamber: StatsChamber
  waiting: number
}

export interface ChamberPulse {
  close_votes: CloseVoteEntry[]
  policy_heat: PolicyHeatEntry[]
  this_week: ThisWeekSummary
  /** Standing committees with long-waiting referrals, highest count first. */
  waiting_in_committee: CommitteeLeaderboardRow[]
}

export interface PulseStatsResponse {
  congress: number
  session: number
  house: ChamberPulse
  senate: ChamberPulse
  as_of: string
}

/** How the two major parties lined up on one roll. */
export type VoteCohesion = 'party-line' | 'bipartisan' | 'unknown'

/** Passage bill vs Senate nomination — so a 50–49 confirm is not read as a bill. */
export type TightnessKind = 'bill' | 'nominee'

/** One recent roll for closest-vote margin bars (gap = |yeas−nays|). */
export interface TightnessDot {
  kind: TightnessKind
  chamber: StatsChamber
  congress: number
  session: number
  roll_number: number
  vote_date: string
  yeas: number
  nays: number
  /** Official roll result (`Passed`, `Failed`, `Confirmed`). */
  result: string
  /** Yea share of yeas+nays, 0–1. Null when the roll has no recorded votes. */
  yea_pct: number | null
  cohesion: VoteCohesion
  party_splits: RollPartySplit[]
  member_votes_available: boolean
  bill_type: string | null
  bill_number: number | null
  headline: string | null
  nominee_name: string | null
  position_title: string | null
}

/** House-passed bill whose process status is still `in_second_chamber_committee`. */
export interface SenateWaitingBill {
  congress: number
  bill_type: string
  bill_number: number
  headline: string | null
  title: string | null
  senate_committee: string | null
  current_label: string | null
  house_passage_date: string | null
  text_grew: boolean
}

/**
 * Recent-lookback tightness + Senate-waiting payload (`GET /stats/tightness.json`).
 * One round trip so closest-vote bars can color party-line vs bipartisan without N+1.
 */
export interface TightnessStatsResponse {
  congress: number
  session: number
  house_passage: TightnessDot[]
  /** Senate passage votes plus recent nomination confirmations, labeled by `kind`. */
  senate: TightnessDot[]
  senate_waiting: SenateWaitingBill[]
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

/** Compact member row for sponsor-filter autocomplete (`GET /stats/members.json`). */
export interface MemberSearchItem {
  bioguide_id: string
  name: string
  chamber: StatsChamber
  party: string
  state: string
  district: number | null
}

export interface MembersSearchResponse {
  items: MemberSearchItem[]
  q: string
  limit: number
}

/** Distinct digest policy areas for feed filter dropdowns. */
export interface PolicyAreasResponse {
  items: string[]
}

export interface CommitteesLeaderboardResponse {
  congress: number
  session: number
  chamber: StatsChamber
  items: CommitteeLeaderboardRow[]
  as_of: string
}

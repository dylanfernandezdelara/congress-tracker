/**
 * TypeScript types for the Senate Data Worker API responses.
 *
 * These types mirror the output JSON schemas from the worker (per SPEC.md v2).
 */

export type ActivitySource = 'congress' | 'senate' | 'govinfo'
export type ActivityType =
  | 'legislation_action'
  | 'roll_call_vote'
  | 'floor_schedule'
  | 'committee_meeting'
  | 'daily_digest'

export interface MemberIndexEntry {
  bioguide_id: string
  name: string
  party: string
  state: string
  chamber: 'Senate'
  url?: string
}

export interface MemberIndexResponse {
  congress: number
  generated_at: string
  members: MemberIndexEntry[]
}

export interface ActivityWindow {
  start_date: string
  end_date: string
}

export interface BillRef {
  congress: number
  type: string
  number: string
  title?: string
  titles?: string[]
  url?: string
  summary?: string
  summary_date?: string
  policy_area?: string
  subjects?: string[]
  committees?: BillCommittee[]
  introduced_date?: string
  latest_action?: BillLatestAction
  law?: BillLawInfo
  impact_evidence?: BillImpactEvidence
  analysis?: BillAnalysis
  sponsor_party_signals?: SponsorPartySignal[]
}

export type EvidenceEndpoint =
  | 'detail'
  | 'summaries'
  | 'subjects'
  | 'committees'
  | 'text'
  | 'actions'
  | 'amendments'
  | 'cbo_cost_estimates'
  | 'committee_reports'
  | 'related_bills'
  | 'cosponsors'

export type EvidenceSourceAvailability = Partial<Record<EvidenceEndpoint, boolean>>

export interface EvidenceEndpointStatus {
  tier: 1 | 2 | 3
  ok: boolean
  fetched_at: string
  url?: string
  attempted_urls?: string[]
  resolved_path?: string
  fallback_used?: boolean
  error?: string
  item_count?: number
}

export interface AmountEvidence {
  value_numeric: number
  unit: 'USD'
  amount_type: 'appropriation' | 'authorization' | 'revenue' | 'deficit_impact' | 'other'
  fiscal_year?: number
  source_endpoint: EvidenceEndpoint | 'summary'
  source_ref: string
  raw_text: string
}

export interface RecipientEvidence {
  type: 'agency' | 'program' | 'state' | 'territory' | 'local' | 'household' | 'other'
  name: string
  identifier?: string
  scope: 'national' | 'state-specific' | 'mixed'
  state_code?: string
}

export interface UnknownReason {
  missing_field: 'amount' | 'recipient' | 'effective_date' | 'state_signal' | 'other'
  category: 'no_source' | 'scope_gap' | 'timing_gap' | 'detail_gap'
  reason: string
  sources_checked: string[]
}

export type PolicyDeltaAction =
  | 'nullify'
  | 'reinstate'
  | 'decouple'
  | 'restore'
  | 'expand'
  | 'restrict'
  | 'authorize'
  | 'prohibit'
  | 'modify'
  | 'other'

export interface PolicyDelta {
  action: PolicyDeltaAction
  target: string
  before_state?: string
  after_state?: string
  confidence: 'high' | 'medium' | 'low'
  evidence_refs: BillAnalysisClaimRef[]
}

export interface BillImpactEvidence {
  schema_version: 1
  bill_key: string
  congress: number
  session: number
  generated_at: string
  source_availability: EvidenceSourceAvailability
  who: RecipientEvidence[]
  what: string[]
  how_much: AmountEvidence[]
  when: Array<{
    date?: string
    date_text: string
    source_endpoint: EvidenceEndpoint | 'summary'
    source_ref: string
  }>
  where: {
    geography_scope: 'national' | 'state-formula' | 'state-named' | 'local' | 'mixed' | 'unknown'
    states_mentioned: string[]
  }
  unknowns: UnknownReason[]
  policy_deltas?: PolicyDelta[]
  richness_score: number
  summary_evidence: string[]
}

export interface BillAnalysisClaimRef {
  source_endpoint: EvidenceEndpoint | 'summary'
  source_ref: string
  quote?: string
}

export interface BillAnalysisClaim {
  text: string
  kind?: 'summary' | 'impact' | 'money' | 'unknown'
  evidence_refs: BillAnalysisClaimRef[]
}

export type PartyStance = 'support' | 'oppose' | 'mixed'

export interface PartyPositionAnalysis {
  party: string
  stance: PartyStance
  evidence_points: string[]
  inferred_rationale: string[]
  confidence: 'high' | 'medium' | 'low'
}

export type BenefitEffect = 'benefit' | 'burden' | 'mixed'

export interface BenefitMapEntry {
  group: string
  expected_effect: BenefitEffect
  evidence_refs: BillAnalysisClaimRef[]
}

export interface StakeholderImpact {
  group: string
  effect: BenefitEffect
  mechanism: string
  confidence: 'high' | 'medium' | 'low'
  evidence_refs: BillAnalysisClaimRef[]
}

export type LikelyReasonCategory =
  | 'fiscal'
  | 'federalism'
  | 'labor'
  | 'business'
  | 'administrative'
  | 'legal'
  | 'other'

export interface LikelyReason {
  actor: string
  category: LikelyReasonCategory
  reason: string
  confidence: 'high' | 'medium' | 'low'
  inference_label: 'inference'
  evidence_refs: BillAnalysisClaimRef[]
}

export interface AnalysisQuality {
  evidence_coverage: 'full' | 'partial' | 'minimal'
  inference_used: boolean
  confidence_reason: string
}

export interface SponsorPartySignal {
  bioguide_id: string
  party: string
  role: 'sponsor' | 'cosponsor'
}

export interface BillAnalysis {
  plain_title: string
  plain_summary: string
  key_provisions: string[]
  why_it_matters: string
  hidden_provisions: string | null
  significance: 'high' | 'medium' | 'low'
  significance_reason: string
  category: string
  affects: string[]
  money_flows?: string[]
  pocketbook_impact?: string[]
  state_local_impact?: string
  unknowns?: string[]
  evidence?: string[]
  confidence?: 'high' | 'medium' | 'low'
  analysis_version?: string
  evidence_fingerprint?: string
  evidence_generated_at?: string
  richness_score?: number
  structured_amounts?: AmountEvidence[]
  structured_recipients?: RecipientEvidence[]
  geography_scope?: 'national' | 'state-formula' | 'state-named' | 'local' | 'mixed' | 'unknown'
  states_mentioned?: string[]
  unknown_reasons?: UnknownReason[]
  policy_deltas?: PolicyDelta[]
  claims?: BillAnalysisClaim[]
  party_positions?: PartyPositionAnalysis[]
  benefit_map?: BenefitMapEntry[]
  stakeholder_impacts?: StakeholderImpact[]
  likely_reasons?: LikelyReason[]
  analysis_quality?: AnalysisQuality
}

export interface BillLatestAction {
  action_date?: string
  text?: string
}

export interface BillLawInfo {
  number?: string
  type?: string
  congress?: number
  law_id?: string
  url?: string
}

export interface BillCommittee {
  name: string
  chamber?: string
  committee_id?: string
}

export interface LegislationActionItem {
  source: 'congress'
  type: 'legislation_action'
  role: 'sponsor' | 'cosponsor'
  action_date: string
  action_text: string
  bill: BillRef
  is_recent?: boolean
}

export interface RollCallVoteItem {
  source: 'senate'
  type: 'roll_call_vote'
  vote_number: number
  vote_date: string
  title?: string
  question?: string
  result?: string
  vote_cast: string
  party?: string
  party_majority_vote?: string
  against_party_majority?: boolean
  bill?: BillRef
  url?: string
  topics?: string[]
}

export interface FloorScheduleItem {
  source: 'senate'
  type: 'floor_schedule'
  date: string
  time?: string
  title: string
  summary?: string
  location?: string
  url?: string
}

export interface CommitteeMeetingItem {
  source: 'senate'
  type: 'committee_meeting'
  date: string
  time?: string
  committee: string
  subcommittee?: string
  title: string
  location?: string
  url?: string
}

export interface DailyDigestItem {
  source: 'govinfo'
  type: 'daily_digest'
  date: string
  title: string
  url?: string
  senate_section_url?: string
  summary?: string
}

export interface CongressCommitteeMeetingItem {
  source: 'congress'
  event_id: string
  congress: number
  chamber: 'Senate'
  date: string
  time?: string
  title: string
  meeting_status?: string
  meeting_type?: string
  committees: Array<{
    name: string
    system_code?: string
    url?: string
  }>
  location?: string
  url?: string
  related_bills: BillRef[]
  related_nominations?: string[]
  related_treaties?: string[]
  nomination_signals: string[]
  meeting_documents: Array<{
    document_type: string
    description?: string
    name?: string
    url?: string
    format?: string
  }>
}

export interface SenateRecordArticleItem {
  source: 'congress'
  issue_date: string
  volume_number: number
  issue_number: string
  section_name: string
  title: string
  start_page?: string
  end_page?: string
  formatted_text_url?: string
  pdf_url?: string
}

export interface GovInfoCrecGranuleHighlightItem {
  source: 'govinfo'
  package_id: string
  granule_id: string
  date: string
  title: string
  granule_class?: string
  sub_granule_class?: string
  member_bioguide_ids?: string[]
  member_names?: string[]
  committee_names?: string[]
  text_url?: string
  pdf_url?: string
}

export interface InsightEvidence {
  source: ActivitySource
  label: string
  date?: string
  url?: string
  vote_number?: number
  bill?: BillRef
}

export type MemberInsightKind =
  | 'party_defection'
  | 'upcoming_focus'
  | 'recent_session'
  | 'topic_focus'

export interface MemberInsight {
  id: string
  kind: MemberInsightKind
  title: string
  detail: string
  score: number
  evidence: InsightEvidence[]
}

export interface MemberDeterministicSummary {
  featured_score: number
  featured_reasons: string[]
  latest_activity_date?: string
  deterministic_points: string[]
  insights: MemberInsight[]
}

export interface FeaturedSenatorEntry {
  bioguide_id: string
  score: number
  reasons: string[]
  latest_activity_date?: string
}

export type ActivityItem =
  | LegislationActionItem
  | RollCallVoteItem
  | FloorScheduleItem
  | CommitteeMeetingItem
  | DailyDigestItem

export interface MemberActivityContext {
  floor_schedule: FloorScheduleItem[]
  committee_meetings: CommitteeMeetingItem[]
  daily_digest: DailyDigestItem[]
  committee_meetings_congress?: CongressCommitteeMeetingItem[]
  senate_record_articles?: SenateRecordArticleItem[]
  senate_granule_highlights?: GovInfoCrecGranuleHighlightItem[]
}

export interface SourceError {
  source: ActivitySource
  message: string
}

export interface MemberActivityResponse {
  member: MemberIndexEntry
  congress: number
  generated_at: string
  window: ActivityWindow
  activities: ActivityItem[]
  context: MemberActivityContext
  summary?: MemberDeterministicSummary
  partial: boolean
  errors: SourceError[]
}

export interface ActivityIndexEntry {
  activity_id: string
  source: ActivitySource
  type: ActivityType
  date: string
  title?: string
  bill?: BillRef
  topics?: string[]
  members: string[]
}

export interface ActivityIndexResponse {
  generated_at: string
  window: ActivityWindow
  activities: ActivityIndexEntry[]
  featured_senators?: FeaturedSenatorEntry[]
}

export interface OutputMemberVote {
  name: string
  state: string
  party: string
  vote_cast: string
}

export interface OutputVoteCounts {
  yeas: number
  nays: number
  present: number
  absent: number
}

export interface OutputVote {
  vote_number: number
  title: string
  question: string
  result: string
  issue?: string
  issue_type?: 'bill' | 'nomination' | 'treaty' | 'other'
  bill?: BillRef
  counts: OutputVoteCounts
  members: OutputMemberVote[]
}

export interface StateVotesResponse {
  state: string
  vote_date: string
  generated_at: string
  congress: number
  session: number
  votes: OutputVote[]
}

export interface StateMetaStats {
  votes_total: number
  votes_with_state_members: number
  state_member_votes: number
}

export interface StateMetaKeys {
  latest: string
  snapshot: string
}

export interface StateMetaResponse {
  state: string
  congress: number
  session: number
  generated_at: string
  cutoff_date_et: string
  target_vote_date: string
  keys: StateMetaKeys
  stats: StateMetaStats
  partial: boolean
  missing_votes: number[]
}

export interface HealthResponse {
  status: string
  timestamp: string
  target_state?: string
  congress?: string | number
  session?: string | number
  message?: string
  generated_at?: string
  age_hours?: number
  max_fresh_hours?: number
}

// ============================================================================
// Vote Ledger & Session Overview (chamber-wide)
// ============================================================================

export interface VoteLedgerEntry {
  vote_number: number
  vote_date: string
  title: string
  question: string
  result: string
  issue?: string
  policy_area?: string
  member_votes: Record<string, string>
}

export interface VoteLedger {
  congress: number
  session: number
  generated_at: string
  total_votes: number
  entries: VoteLedgerEntry[]
}

export interface SenatorSessionStat {
  bioguide_id: string
  name: string
  party: string
  state: string
  votes_cast: number
  votes_missed: number
  party_defections: number
  alignment_pct: number
}

export interface SessionOverview {
  congress: number
  session: number
  generated_at: string
  total_votes: number
  latest_vote_date: string
  total_defections: number
  senators: SenatorSessionStat[]
}

// ============================================================================
// Senate vote intelligence read model
// ============================================================================

export type VoteCast = 'yea' | 'nay' | 'present' | 'notVoting'
export type VoteStatus = 'passed' | 'rejected' | 'in-progress'
export type CoverageLevel = 'full' | 'partial' | 'minimal'

export interface SourceCoverage {
  level: CoverageLevel
  vote_data: boolean
  bill_context: boolean
  congressional_record: boolean
  floor_logs: boolean
  model_summary: boolean
  note?: string
}

export interface BriefingRankingReason {
  code: string
  label: string
}

export interface BriefingCrossover {
  bioguide_id: string
  name: string
  party: string
  state: string
  vote_cast: VoteCast
}

export interface BriefingVoteSummary {
  yea: number
  nay: number
  present: number
  absent: number
}

export interface BriefingFeedItem {
  id: string
  congress: number
  session: number
  vote_number: number
  vote_date: string
  title: string
  summary: string
  outcome_label: string
  status: VoteStatus
  category: string
  significance: 'high' | 'medium' | 'low'
  bill?: BillRef
  tally: BriefingVoteSummary
  crossed_party_lines: BriefingCrossover[]
  ranking_reasons: BriefingRankingReason[]
  source_coverage: SourceCoverage
  detail_path: string
  score: number
}

export interface BriefingFeedResponse {
  generated_at: string
  source: 'd1' | 'r2' | 'derived'
  items: BriefingFeedItem[]
  coverage_note?: string
}

export interface VotePartyBreakdown {
  party: string
  yea: number
  nay: number
  present: number
  not_voting: number
  majority_vote?: VoteCast
}

export interface HistoricalVoteReference {
  congress: number
  session: number
  vote_number: number
  vote_date: string
  title: string
  result: string
}

export type ArgumentSourceType =
  | 'congress_record'
  | 'floor_log'
  | 'bill_analysis'
  | 'official_summary'
  | 'other'

export interface ArgumentExcerpt {
  id: string
  party?: string
  source_type: ArgumentSourceType
  source_label: string
  source_url?: string
  quote?: string
  note?: string
  date?: string
}

export interface PartyArgumentSummaryView {
  party: string
  stance: PartyStance
  summary: string
  confidence: 'high' | 'medium' | 'low'
  evidence_points: string[]
  excerpt_ids: string[]
  coverage_note?: string
}

export interface VoteDetailResponse {
  generated_at: string
  source: 'd1' | 'r2' | 'derived'
  vote: {
    id: string
    congress: number
    session: number
    vote_number: number
    vote_date: string
    title: string
    question: string
    result: string
    issue?: string
    bill?: BillRef
    tally: BriefingVoteSummary
    status: VoteStatus
  }
  procedural_context: {
    step_type: string
    question: string
  }
  party_breakdown: VotePartyBreakdown[]
  crossovers: BriefingCrossover[]
  history: {
    thread_key: string
    measure_recurrence_count: number
    issue_key: string
    issue_title: string
    issue_recurrence_count: number
    first_seen_vote_date?: string
    last_comparable_vote?: HistoricalVoteReference
    related_votes: HistoricalVoteReference[]
  }
  arguments: {
    available: boolean
    coverage_note: string
    parties: PartyArgumentSummaryView[]
    excerpts: ArgumentExcerpt[]
  }
  ranking_reasons: BriefingRankingReason[]
  source_coverage: SourceCoverage
}

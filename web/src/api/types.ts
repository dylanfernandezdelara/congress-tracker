/**
 * TypeScript types for the Senate Data Worker API responses.
 *
 * These types mirror the JSON payloads returned by the worker.
 */

export type ActivitySource = 'congress' | 'senate' | 'govinfo'
export type ActivityType =
  | 'legislation_action'
  | 'roll_call_vote'
  | 'floor_schedule'
  | 'committee_meeting'
  | 'daily_digest'

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

export interface FeaturedSenatorEntry {
  bioguide_id: string
  score: number
  reasons: string[]
  latest_activity_date?: string
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

export type VoteContentConfidence = 'high' | 'medium' | 'low'

export type VoteSourceBasis =
  | 'official_bill_summary'
  | 'bill_metadata_only'
  | 'amendment_text'
  | 'vote_question'
  | 'congressional_record'
  | 'impact_evidence'
  | 'analysis_summary'
  | 'unknown'

export interface VoteContentProfile {
  vote_id: string
  congress: number
  session: number
  vote_number: number
  vote_date: string
  target_type: string
  stage: string
  plain_action: string
  official_summary: string | null
  public_impact_summary: string
  policy_topics: string[]
  affected_groups: string[]
  content_confidence: VoteContentConfidence
  source_basis: VoteSourceBasis[]
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
  source_coverage: SourceCoverage
  detail_path: string
  plain_action: string
  public_impact_summary: string
  content_confidence: VoteContentConfidence
  source_basis: VoteSourceBasis[]
}

export interface BriefingFeedResponse {
  generated_at: string
  source: 'd1'
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
  source: 'd1'
  vote_content_profile: VoteContentProfile
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
  source_coverage: SourceCoverage
}

import type { BillRef, PartyPositionAnalysis, VoteContentConfidence, VoteContentProfile, VoteSourceBasis } from "./types";

export type VoteCast = "yea" | "nay" | "present" | "notVoting";
export type VoteStatus = "passed" | "rejected" | "in-progress";
export type SignificanceLevel = "high" | "medium" | "low";
export type SourceCoverageLevel = "full" | "partial" | "minimal";
export type ArgumentSourceType =
  | "congress_record"
  | "floor_log"
  | "bill_analysis"
  | "official_summary"
  | "other";

export interface SourceCoverage {
  level: SourceCoverageLevel;
  vote_data: boolean;
  bill_context: boolean;
  congressional_record: boolean;
  floor_logs: boolean;
  model_summary: boolean;
  note?: string;
}

export interface BriefingCrossover {
  bioguide_id: string;
  name: string;
  party: string;
  state: string;
  vote_cast: VoteCast;
}

export interface BriefingVoteSummary {
  yea: number;
  nay: number;
  present: number;
  absent: number;
}

export interface BriefingFeedItem {
  id: string;
  congress: number;
  session: number;
  vote_number: number;
  vote_date: string;
  title: string;
  summary: string;
  outcome_label: string;
  status: VoteStatus;
  category: string;
  significance: SignificanceLevel;
  bill?: BillRef;
  tally: BriefingVoteSummary;
  crossed_party_lines: BriefingCrossover[];
  source_coverage: SourceCoverage;
  detail_path: string;
  plain_action: string;
  public_impact_summary: string;
  content_confidence: VoteContentConfidence;
  source_basis: VoteSourceBasis[];
}

export interface BriefingFeedResponse {
  generated_at: string;
  source: "d1" | "r2" | "derived";
  items: BriefingFeedItem[];
  coverage_note?: string;
}

export interface VotePartyBreakdown {
  party: string;
  yea: number;
  nay: number;
  present: number;
  not_voting: number;
  majority_vote?: VoteCast;
}

export interface HistoricalVoteReference {
  congress: number;
  session: number;
  vote_number: number;
  vote_date: string;
  title: string;
  result: string;
}

export interface ArgumentExcerpt {
  id: string;
  party?: string;
  source_type: ArgumentSourceType;
  source_label: string;
  source_url?: string;
  quote?: string;
  note?: string;
  date?: string;
}

export interface PartyArgumentSummary {
  party: string;
  stance: PartyPositionAnalysis["stance"];
  summary: string;
  confidence: "high" | "medium" | "low";
  evidence_points: string[];
  excerpt_ids: string[];
  coverage_note?: string;
}

export interface VoteDetailResponse {
  generated_at: string;
  source: "d1" | "r2" | "derived";
  vote_content_profile: VoteContentProfile;
  vote: {
    id: string;
    congress: number;
    session: number;
    vote_number: number;
    vote_date: string;
    title: string;
    question: string;
    result: string;
    issue?: string;
    bill?: BillRef;
    tally: BriefingVoteSummary;
    status: VoteStatus;
  };
  procedural_context: {
    step_type: string;
    question: string;
  };
  party_breakdown: VotePartyBreakdown[];
  crossovers: BriefingCrossover[];
  history: {
    thread_key: string;
    measure_recurrence_count: number;
    issue_key: string;
    issue_title: string;
    issue_recurrence_count: number;
    first_seen_vote_date?: string;
    last_comparable_vote?: HistoricalVoteReference;
    related_votes: HistoricalVoteReference[];
  };
  arguments: {
    available: boolean;
    coverage_note: string;
    parties: PartyArgumentSummary[];
    excerpts: ArgumentExcerpt[];
  };
  source_coverage: SourceCoverage;
}

export interface PipelineMaterialization {
  briefing: BriefingFeedResponse;
  voteDetails: VoteDetailResponse[];
}

export interface PlatformDbVote {
  congress: number;
  session: number;
  vote_number: number;
  vote_date: string;
  title: string;
  question: string;
  result: string;
  issue?: string;
  bill_key?: string;
  policy_area?: string;
  thread_key: string;
  status: VoteStatus;
  significance: SignificanceLevel;
  score: number;
  summary: string;
  updated_at: string;
}

export interface PlatformDbVoteMember {
  congress: number;
  session: number;
  vote_number: number;
  bioguide_id: string;
  name: string;
  party: string;
  state: string;
  vote_cast: string;
  against_party_majority: boolean;
}

export interface PlatformDbBill {
  bill_key: string;
  congress: number;
  bill_type: string;
  bill_number: string;
  title?: string;
  summary?: string;
  policy_area?: string;
  url?: string;
  significance?: SignificanceLevel;
  category?: string;
  updated_at: string;
}

export interface PipelineJobBase {
  type: string;
  created_at: string;
}

export interface MaterializeReadModelsJob extends PipelineJobBase {
  type: "materialize_read_models";
  reason: string;
}

export interface HistoricalBackfillJob extends PipelineJobBase {
  type: "historical_backfill";
  congress: number;
  session?: number;
}

export interface ExtractVoteEvidenceJob extends PipelineJobBase {
  type: "extract_vote_evidence";
  congress: number;
  session: number;
  vote_number: number;
}

export type PipelineJob =
  | MaterializeReadModelsJob
  | HistoricalBackfillJob
  | ExtractVoteEvidenceJob;

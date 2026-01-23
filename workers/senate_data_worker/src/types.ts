/**
 * Shared types for the Senate Data Worker.
 *
 * These types define the JSON output schemas per SPEC.md v1.
 */

// ============================================================================
// Output JSON Types (per SPEC.md)
// ============================================================================

/**
 * Member vote record for output JSON.
 */
export interface OutputMember {
  name: string; // e.g., "Gillibrand (D-NY)"
  state: string; // Two-letter state code (uppercase)
  party: string; // R, D, I, etc.
  vote_cast: string; // "Yea", "Nay", "Present", "Not Voting"
}

/**
 * Vote counts for output JSON.
 */
export interface OutputCounts {
  yeas: number;
  nays: number;
  present: number;
  absent: number; // Note: output uses "absent" per spec
}

/**
 * Single vote record for output JSON.
 */
export interface OutputVote {
  vote_number: number;
  title: string;
  question: string;
  result: string;
  issue?: string;
  issue_type?: "bill" | "nomination" | "treaty" | "other";
  bill?: BillRef;
  counts: OutputCounts;
  members: OutputMember[];
}

/**
 * Main snapshot/latest.json structure.
 */
export interface SnapshotJson {
  state: string;
  vote_date: string; // YYYY-MM-DD
  generated_at: string; // ISO 8601 timestamp
  congress: number;
  session: number;
  votes: OutputVote[];
}

/**
 * Stats object for _meta.json.
 */
export interface MetaStats {
  votes_total: number;
  votes_with_state_members: number;
  state_member_votes: number;
}

/**
 * Keys object for _meta.json.
 */
export interface MetaKeys {
  latest: string;
  snapshot: string;
}

/**
 * _meta.json structure.
 */
export interface MetaJson {
  state: string;
  congress: number;
  session: number;
  generated_at: string; // ISO 8601 timestamp
  cutoff_date_et: string; // YYYY-MM-DD
  target_vote_date: string; // YYYY-MM-DD
  keys: MetaKeys;
  stats: MetaStats;
  partial: boolean;
  missing_votes: number[];
}

// ============================================================================
// Member Activity Types (Per-member daily activity)
// ============================================================================

export type ActivitySource = "congress" | "senate" | "govinfo";

export type ActivityType =
  | "legislation_action"
  | "roll_call_vote"
  | "floor_schedule"
  | "committee_meeting"
  | "daily_digest";

export interface MemberIndexEntry {
  bioguide_id: string;
  name: string;
  party: string;
  state: string;
  chamber: "Senate";
  url?: string;
}

export interface MemberIndexJson {
  congress: number;
  generated_at: string;
  members: MemberIndexEntry[];
}

export interface ActivityWindow {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}

export interface BillRef {
  congress: number;
  type: string; // e.g., "S", "S.RES", "PN"
  number: string; // e.g., "123"
  title?: string;
  url?: string;
  summary?: string;
  summary_date?: string;
  policy_area?: string;
  subjects?: string[];
  committees?: BillCommittee[];
  introduced_date?: string;
  latest_action?: BillLatestAction;
}

export interface BillLatestAction {
  action_date?: string; // YYYY-MM-DD
  text?: string;
}

export interface BillCommittee {
  name: string;
  chamber?: string;
  committee_id?: string;
}

export interface LegislationActionItem {
  source: "congress";
  type: "legislation_action";
  role: "sponsor" | "cosponsor";
  action_date: string; // YYYY-MM-DD
  action_text: string;
  bill: BillRef;
  is_recent?: boolean;
  activity_id?: string;
  topics?: string[];
}

export interface RollCallVoteItem {
  source: "senate";
  type: "roll_call_vote";
  vote_number: number;
  vote_date: string; // YYYY-MM-DD
  title?: string;
  question?: string;
  result?: string;
  vote_cast: string;
  bill?: BillRef;
  url?: string;
  activity_id?: string;
  topics?: string[];
}

export interface FloorScheduleItem {
  source: "senate";
  type: "floor_schedule";
  date: string; // YYYY-MM-DD
  time?: string;
  title: string;
  summary?: string;
  location?: string;
  url?: string;
  activity_id?: string;
  topics?: string[];
}

export interface CommitteeMeetingItem {
  source: "senate";
  type: "committee_meeting";
  date: string; // YYYY-MM-DD
  time?: string;
  committee: string;
  subcommittee?: string;
  title: string;
  location?: string;
  url?: string;
  activity_id?: string;
  topics?: string[];
}

export interface DailyDigestItem {
  source: "govinfo";
  type: "daily_digest";
  date: string; // YYYY-MM-DD
  title: string;
  url?: string;
  senate_section_url?: string;
  summary?: string;
  activity_id?: string;
  topics?: string[];
}

export type ActivityItem =
  | LegislationActionItem
  | RollCallVoteItem
  | FloorScheduleItem
  | CommitteeMeetingItem
  | DailyDigestItem;

export interface MemberActivityContext {
  floor_schedule: FloorScheduleItem[];
  committee_meetings: CommitteeMeetingItem[];
  daily_digest: DailyDigestItem[];
}

export interface SourceError {
  source: ActivitySource;
  message: string;
}

export interface MemberActivityJson {
  member: MemberIndexEntry;
  congress: number;
  generated_at: string;
  window: ActivityWindow;
  activities: ActivityItem[];
  context: MemberActivityContext;
  partial: boolean;
  errors: SourceError[];
}

export interface ActivityIndexEntry {
  activity_id: string;
  source: ActivitySource;
  type: ActivityType;
  date: string;
  title?: string;
  bill?: BillRef;
  topics?: string[];
  members: string[];
}

export interface ActivityIndexJson {
  generated_at: string;
  window: ActivityWindow;
  activities: ActivityIndexEntry[];
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Configuration for ingestion.
 */
export interface IngestConfig {
  congress: number;
  session: number;
  targetState: string;
  congressApiKey: string;
}

/**
 * Result from a single vote detail fetch.
 */
export interface VoteDetailResult {
  voteNumber: number;
  success: boolean;
  error?: string;
}

/**
 * Result from the full ingestion process.
 */
export interface IngestResult {
  success: boolean;
  targetVoteDate: string | null;
  cutoffDateEt: string;
  votesTotal: number;
  votesWithStateMembers: number;
  stateMemberVotes: number;
  partial: boolean;
  missingVotes: number[];
  snapshot: SnapshotJson | null;
  meta: MetaJson | null;
  error?: string;
}

/**
 * Result from multi-state ingestion.
 */
export interface MultiStateIngestResult {
  success: boolean;
  targetVoteDate: string | null;
  cutoffDateEt: string;
  votesTotal: number;
  partial: boolean;
  missingVotes: number[];
  generatedAt: string;
  perState: Record<
    string,
    {
      snapshot: SnapshotJson;
      meta: MetaJson;
      votesWithStateMembers: number;
      stateMemberVotes: number;
    }
  >;
  error?: string;
}

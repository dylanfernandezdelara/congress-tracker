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
// Internal Types
// ============================================================================

/**
 * Configuration for ingestion.
 */
export interface IngestConfig {
  congress: number;
  session: number;
  targetState: string;
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


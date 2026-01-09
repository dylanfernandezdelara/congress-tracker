/**
 * TypeScript types for the Senate Data Worker API responses.
 *
 * These types mirror the output JSON schemas from the worker (per SPEC.md v1).
 * They are used by the fetch client and UI components.
 */

/**
 * Vote counts breakdown for a single vote.
 */
export interface VoteCounts {
  yeas: number;
  nays: number;
  present: number;
  absent: number;
}

/**
 * A senator's vote record within a vote.
 */
export interface VoteMember {
  /** Full display name, e.g., "Gillibrand (D-NY)" */
  name: string;
  /** Two-letter state code (uppercase), e.g., "NY" */
  state: string;
  /** Party affiliation: "R", "D", "I", etc. */
  party: string;
  /** The vote cast: "Yea", "Nay", "Present", or "Not Voting" */
  vote_cast: string;
}

/**
 * A single Senate roll-call vote.
 */
export interface Vote {
  /** Vote number within the session */
  vote_number: number;
  /** Vote title/description */
  title: string;
  /** The question being voted on */
  question: string;
  /** Vote result, e.g., "Agreed to", "Rejected" */
  result: string;
  /** Related bill/issue identifier (optional) */
  issue?: string;
  /** Aggregate vote counts */
  counts: VoteCounts;
  /** Individual member votes (filtered to target state) */
  members: VoteMember[];
}

/**
 * Main response structure from GET /state/{state}/latest.json
 *
 * Contains the latest voting data for senators from a specific state.
 */
export interface LatestStateResponse {
  /** Two-letter state code, e.g., "NY" */
  state: string;
  /** Date of the votes in YYYY-MM-DD format */
  vote_date: string;
  /** ISO 8601 timestamp when this data was generated */
  generated_at: string;
  /** Congress number, e.g., 119 */
  congress: number;
  /** Session number, e.g., 1 or 2 */
  session: number;
  /** Array of votes with state member participation */
  votes: Vote[];
}

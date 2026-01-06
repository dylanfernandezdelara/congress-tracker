/**
 * XML parsing utilities for Senate vote data.
 *
 * Uses fast-xml-parser for Worker-compatible XML parsing.
 * Handles the quirks of Senate XML:
 * - Singleton vs array normalization (when only one <vote> or <member>)
 * - Field-name fallbacks for different XML schema versions
 * - Count field variations (count vs counts, absent vs not_voting)
 */

import { XMLParser } from "fast-xml-parser";
import { parseVoteDate } from "./date-parse";

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed vote summary from the vote menu XML.
 */
export interface VoteSummary {
  vote_number: number;
  vote_date: string; // YYYY-MM-DD
  title: string;
  result: string | null;
}

/**
 * Individual member's vote from the vote detail XML.
 */
export interface MemberVote {
  member_full: string;
  lis_member_id: string | null;
  party: string;
  state: string;
  vote_cast: string;
}

/**
 * Vote counts from the detail XML.
 */
export interface VoteCounts {
  yeas: number;
  nays: number;
  present: number;
  not_voting: number;
}

/**
 * Parsed vote details from individual vote XML.
 */
export interface VoteDetails {
  congress: number;
  session: number;
  vote_number: number;
  vote_date: string; // YYYY-MM-DD
  vote_title: string;
  vote_question: string;
  vote_result: string;
  counts: VoteCounts;
  member_votes: MemberVote[];
}

// ============================================================================
// XML Parser Configuration
// ============================================================================

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Don't transform tag names - keep original casing
  transformTagName: undefined,
  // Parse numbers as strings initially (we handle conversion manually)
  parseTagValue: false,
  trimValues: true,
};

/**
 * Create a configured XML parser instance.
 */
function createParser(): XMLParser {
  return new XMLParser(parserOptions);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize a value that might be a singleton or array to always be an array.
 *
 * fast-xml-parser returns a single object when there's one child,
 * and an array when there are multiple. This normalizes to always array.
 */
export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Get a text value from an object, handling both string and object forms.
 *
 * XML text content can appear as either a plain string or as { "#text": "..." }
 */
function getText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    return String((value as { "#text": unknown })["#text"]).trim();
  }
  return "";
}

/**
 * Get first non-empty value from multiple field names (fallback chain).
 */
function getFirstOf(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = getText(obj[key]);
    if (val) return val;
  }
  return "";
}

/**
 * Parse a numeric value, returning 0 if invalid.
 */
function parseNum(value: unknown): number {
  const text = getText(value);
  const num = parseInt(text, 10);
  return isNaN(num) ? 0 : num;
}

// ============================================================================
// Vote Menu Parsing
// ============================================================================

interface RawVoteMenuItem {
  vote_number?: unknown;
  vote_date?: unknown;
  issue?: unknown;
  question?: unknown;
  result?: unknown;
  vote_title?: unknown;
  title?: unknown;
}

interface RawVoteMenu {
  vote_summary?: {
    congress_year?: unknown;
    congress?: unknown;
    session?: unknown;
    votes?: {
      vote?: RawVoteMenuItem | RawVoteMenuItem[];
    };
  };
}

/**
 * Parse the vote menu XML into an array of VoteSummary.
 *
 * Handles:
 * - Single vote vs multiple votes (array normalization)
 * - congress_year extraction for short date formats
 * - Title fallbacks (vote_title -> title -> question + issue)
 */
export function parseVoteMenuXml(xml: string): VoteSummary[] {
  const parser = createParser();
  const parsed = parser.parse(xml) as RawVoteMenu;

  const summary = parsed.vote_summary;
  if (!summary) return [];

  // Extract congress_year for short date format parsing
  const congressYear = parseNum(summary.congress_year) || undefined;

  const rawVotes = ensureArray(summary.votes?.vote);
  const results: VoteSummary[] = [];

  for (const vote of rawVotes) {
    const voteNumber = parseNum(vote.vote_number);
    if (!voteNumber) continue;

    const dateStr = getText(vote.vote_date);
    const voteDate = parseVoteDate(dateStr, congressYear);
    if (!voteDate) continue;

    // Build title with fallbacks
    const title = buildVoteMenuTitle(vote);

    const result = getText(vote.result) || null;

    results.push({
      vote_number: voteNumber,
      vote_date: voteDate,
      title,
      result,
    });
  }

  return results;
}

/**
 * Build vote menu title from available fields with fallbacks.
 *
 * Priority: vote_title -> title -> (question + issue) -> "Unknown Vote"
 */
function buildVoteMenuTitle(vote: RawVoteMenuItem): string {
  // Try explicit title fields first
  const title = getFirstOf(
    vote as Record<string, unknown>,
    "vote_title",
    "title"
  );
  if (title) return truncateTitle(title, 100);

  // Combine question and issue
  const question = getText(vote.question);
  const issue = getText(vote.issue);

  const parts: string[] = [];
  if (question) parts.push(question);
  if (issue) parts.push(issue);

  if (parts.length > 0) {
    return truncateTitle(parts.join(" - "), 100);
  }

  return "Unknown Vote";
}

/**
 * Truncate a title at word boundary if too long.
 */
function truncateTitle(text: string, maxLen: number): string {
  // Normalize whitespace
  const normalized = text.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLen) return normalized;

  // Truncate at word boundary
  const truncated = normalized.slice(0, maxLen - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLen / 2) {
    return truncated.slice(0, lastSpace) + "...";
  }
  return truncated + "...";
}

// ============================================================================
// Vote Detail Parsing
// ============================================================================

interface RawMember {
  member_full?: unknown;
  lis_member_id?: unknown;
  party?: unknown;
  state?: unknown;
  vote_cast?: unknown;
}

interface RawVoteDetail {
  roll_call_vote?: {
    congress?: unknown;
    session?: unknown;
    vote_number?: unknown;
    vote_date?: unknown;
    // Question fields (fallback chain)
    vote_question_text?: unknown;
    vote_question?: unknown;
    question?: unknown;
    // Document/issue fields (fallback chain)
    vote_document_text?: unknown;
    document_short_title?: unknown;
    issue?: unknown;
    // Result fields (fallback chain)
    vote_result_text?: unknown;
    vote_result?: unknown;
    result?: unknown;
    // Title fields (fallback chain)
    vote_title?: unknown;
    title?: unknown;
    // Counts (can be nested under "count" or "counts")
    count?: RawCounts;
    counts?: RawCounts;
    // Members
    members?: {
      member?: RawMember | RawMember[];
    };
  };
}

interface RawCounts {
  yeas?: unknown;
  nays?: unknown;
  present?: unknown;
  absent?: unknown;
  not_voting?: unknown;
}

/**
 * Parse individual vote XML into VoteDetails.
 *
 * Handles:
 * - Field name fallbacks for question, document, result, title
 * - Count container variations (count vs counts)
 * - Not voting variations (absent vs not_voting)
 * - Single member vs multiple members (array normalization)
 * - State code normalization to uppercase
 */
export function parseVoteDetailXml(
  xml: string,
  defaultCongress: number,
  defaultSession: number
): VoteDetails | null {
  const parser = createParser();
  const parsed = parser.parse(xml) as RawVoteDetail;

  const vote = parsed.roll_call_vote;
  if (!vote) return null;

  const voteNumber = parseNum(vote.vote_number);
  if (!voteNumber) return null;

  // Parse date
  const dateStr = getText(vote.vote_date);
  const voteDate = parseVoteDate(dateStr);
  if (!voteDate) return null;

  // Extract fields with fallbacks
  const voteFields = vote as Record<string, unknown>;
  const question = getFirstOf(
    voteFields,
    "vote_question_text",
    "vote_question",
    "question"
  );
  const document = getFirstOf(
    voteFields,
    "vote_document_text",
    "document_short_title",
    "issue"
  );
  const result = getFirstOf(
    voteFields,
    "vote_result_text",
    "vote_result",
    "result"
  );

  // Build title with fallbacks
  const voteTitle = buildVoteDetailTitle(voteFields, question, document);

  // Parse counts
  const rawCounts = vote.count || vote.counts || {};
  const counts = parseCounts(rawCounts);

  // Parse member votes
  const rawMembers = ensureArray(vote.members?.member);
  const memberVotes = rawMembers
    .map(parseMemberVote)
    .filter((m): m is MemberVote => m !== null);

  return {
    congress: parseNum(vote.congress) || defaultCongress,
    session: parseNum(vote.session) || defaultSession,
    vote_number: voteNumber,
    vote_date: voteDate,
    vote_title: voteTitle,
    vote_question: question,
    vote_result: result,
    counts,
    member_votes: memberVotes,
  };
}

/**
 * Build vote detail title with fallbacks.
 */
function buildVoteDetailTitle(
  vote: Record<string, unknown>,
  question: string,
  document: string
): string {
  // Try explicit title first
  const title = getFirstOf(vote, "vote_title", "title");
  if (title) return truncateTitle(title, 120);

  // Combine question and document
  const parts: string[] = [];
  if (question) parts.push(question);
  if (document) parts.push(document);

  if (parts.length > 0) {
    return truncateTitle(parts.join(": "), 120);
  }

  return "Unknown Vote";
}

/**
 * Parse vote counts with fallbacks for absent vs not_voting.
 */
function parseCounts(raw: RawCounts): VoteCounts {
  return {
    yeas: parseNum(raw.yeas),
    nays: parseNum(raw.nays),
    present: parseNum(raw.present),
    // Handle both "absent" and "not_voting" field names
    not_voting: parseNum(raw.not_voting) || parseNum(raw.absent),
  };
}

/**
 * Parse a single member vote entry.
 */
function parseMemberVote(raw: RawMember): MemberVote | null {
  const memberFull = getText(raw.member_full);
  if (!memberFull) return null;

  return {
    member_full: memberFull,
    lis_member_id: getText(raw.lis_member_id) || null,
    party: getText(raw.party),
    // Normalize state to uppercase
    state: getText(raw.state).toUpperCase(),
    vote_cast: getText(raw.vote_cast),
  };
}

// ============================================================================
// Filtering Utilities
// ============================================================================

/**
 * Filter votes by date.
 */
export function filterVotesByDate(
  votes: VoteSummary[],
  targetDate: string
): VoteSummary[] {
  return votes.filter((v) => v.vote_date === targetDate);
}

/**
 * Filter member votes by state.
 */
export function filterMembersByState(
  members: MemberVote[],
  state: string
): MemberVote[] {
  const normalizedState = state.toUpperCase();
  return members.filter((m) => m.state === normalizedState);
}

/**
 * Get unique vote dates from a list of votes.
 */
export function getUniqueDates(votes: VoteSummary[]): string[] {
  const dates = new Set(votes.map((v) => v.vote_date));
  return Array.from(dates).sort();
}


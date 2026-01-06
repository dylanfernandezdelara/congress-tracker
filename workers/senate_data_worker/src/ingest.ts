/**
 * Ingestion orchestration for Senate vote data.
 *
 * Coordinates:
 * - Target date selection (max vote date < today ET)
 * - Vote menu fetching and parsing
 * - Vote detail fetching (parallel with retry)
 * - State filtering and JSON output building
 */

import { todayEastern, findMaxDateBefore } from "./date-parse";
import {
  fetchVoteMenu,
  fetchVoteDetailsParallel,
  type FetchConfig,
} from "./fetch";
import {
  parseVoteMenuXml,
  parseVoteDetailXml,
  filterVotesByDate,
  filterMembersByState,
  getUniqueDates,
  type VoteSummary,
  type VoteDetails,
} from "./xml";
import type {
  IngestConfig,
  IngestResult,
  SnapshotJson,
  MetaJson,
  OutputVote,
  OutputMember,
  OutputCounts,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Default fetch configuration for ingestion. */
const DEFAULT_FETCH_CONFIG: FetchConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeoutMs: 15000, // Longer timeout for Senate servers
  concurrency: 5,
};

// ============================================================================
// Main Ingestion Function
// ============================================================================

/**
 * Run the full ingestion process.
 *
 * 1. Determine cutoff date (today in ET)
 * 2. Fetch vote menu XML
 * 3. Parse and extract unique vote dates
 * 4. Select target date (max date < cutoff)
 * 5. Filter votes to target date
 * 6. Fetch vote details in parallel
 * 7. Parse and filter to target state
 * 8. Build output JSON structures
 *
 * @param config - Ingestion configuration
 * @param fetchConfig - Optional fetch configuration override
 * @returns IngestResult with snapshot and meta data
 */
export async function runIngestion(
  config: IngestConfig,
  fetchConfig: FetchConfig = DEFAULT_FETCH_CONFIG
): Promise<IngestResult> {
  const { congress, session, targetState } = config;
  const cutoffDateEt = todayEastern();
  const generatedAt = new Date().toISOString();

  console.log(
    `[ingest] Starting ingestion: congress=${congress}, session=${session}, state=${targetState}`
  );
  console.log(`[ingest] Cutoff date (ET): ${cutoffDateEt}`);

  // -------------------------------------------------------------------------
  // Step 1: Fetch vote menu
  // -------------------------------------------------------------------------
  console.log("[ingest] Fetching vote menu...");
  const menuResult = await fetchVoteMenu(congress, session, fetchConfig);

  if (!menuResult.success || !menuResult.data) {
    console.error(`[ingest] Failed to fetch vote menu: ${menuResult.error}`);
    return {
      success: false,
      targetVoteDate: null,
      cutoffDateEt,
      votesTotal: 0,
      votesWithStateMembers: 0,
      stateMemberVotes: 0,
      partial: false,
      missingVotes: [],
      snapshot: null,
      meta: null,
      error: `Failed to fetch vote menu: ${menuResult.error}`,
    };
  }

  // -------------------------------------------------------------------------
  // Step 2: Parse vote menu
  // -------------------------------------------------------------------------
  console.log("[ingest] Parsing vote menu...");
  const allVotes = parseVoteMenuXml(menuResult.data);
  console.log(`[ingest] Found ${allVotes.length} total votes in menu`);

  if (allVotes.length === 0) {
    console.warn("[ingest] No votes found in menu");
    return {
      success: false,
      targetVoteDate: null,
      cutoffDateEt,
      votesTotal: 0,
      votesWithStateMembers: 0,
      stateMemberVotes: 0,
      partial: false,
      missingVotes: [],
      snapshot: null,
      meta: null,
      error: "No votes found in vote menu",
    };
  }

  // -------------------------------------------------------------------------
  // Step 3: Select target date
  // -------------------------------------------------------------------------
  const uniqueDates = getUniqueDates(allVotes);
  console.log(`[ingest] Unique vote dates: ${uniqueDates.join(", ")}`);

  const targetVoteDate = findMaxDateBefore(uniqueDates, cutoffDateEt);

  if (!targetVoteDate) {
    console.warn(`[ingest] No vote dates found before cutoff ${cutoffDateEt}`);
    return {
      success: false,
      targetVoteDate: null,
      cutoffDateEt,
      votesTotal: 0,
      votesWithStateMembers: 0,
      stateMemberVotes: 0,
      partial: false,
      missingVotes: [],
      snapshot: null,
      meta: null,
      error: `No vote dates found before cutoff ${cutoffDateEt}`,
    };
  }

  console.log(`[ingest] Target vote date: ${targetVoteDate}`);

  // -------------------------------------------------------------------------
  // Step 4: Filter votes to target date
  // -------------------------------------------------------------------------
  const targetVotes = filterVotesByDate(allVotes, targetVoteDate);
  console.log(`[ingest] Votes on target date: ${targetVotes.length}`);

  if (targetVotes.length === 0) {
    console.warn("[ingest] No votes on target date");
    return {
      success: false,
      targetVoteDate,
      cutoffDateEt,
      votesTotal: 0,
      votesWithStateMembers: 0,
      stateMemberVotes: 0,
      partial: false,
      missingVotes: [],
      snapshot: null,
      meta: null,
      error: `No votes found on target date ${targetVoteDate}`,
    };
  }

  // -------------------------------------------------------------------------
  // Step 5: Fetch vote details
  // -------------------------------------------------------------------------
  console.log("[ingest] Fetching vote details...");
  const voteNumbers = targetVotes.map((v) => v.vote_number);
  const detailsResult = await fetchVoteDetailsParallel(
    voteNumbers,
    congress,
    session,
    fetchConfig
  );

  console.log(
    `[ingest] Fetch results: ${detailsResult.successCount} success, ${detailsResult.failureCount} failed`
  );

  // -------------------------------------------------------------------------
  // Step 6: Parse vote details and filter to state
  // -------------------------------------------------------------------------
  console.log("[ingest] Parsing vote details and filtering to state...");
  const parsedDetails: VoteDetails[] = [];
  const missingVotes: number[] = [];

  for (const voteNum of voteNumbers) {
    const fetchResult = detailsResult.results.get(voteNum);

    if (!fetchResult?.success || !fetchResult.data) {
      console.warn(
        `[ingest] Missing vote ${voteNum}: ${fetchResult?.error ?? "unknown"}`
      );
      missingVotes.push(voteNum);
      continue;
    }

    const parsed = parseVoteDetailXml(fetchResult.data, congress, session);
    if (!parsed) {
      console.warn(`[ingest] Failed to parse vote ${voteNum}`);
      missingVotes.push(voteNum);
      continue;
    }

    parsedDetails.push(parsed);
  }

  // -------------------------------------------------------------------------
  // Step 7: Build output JSON
  // -------------------------------------------------------------------------
  console.log("[ingest] Building output JSON...");
  const { outputVotes, stateMemberVotes } = buildOutputVotes(
    parsedDetails,
    targetVotes,
    targetState
  );

  const votesTotal = targetVotes.length;
  const votesWithStateMembers = outputVotes.length;
  const partial = missingVotes.length > 0;

  // Build snapshot
  const snapshot: SnapshotJson = {
    state: targetState,
    vote_date: targetVoteDate,
    generated_at: generatedAt,
    congress,
    session,
    votes: outputVotes,
  };

  // Build meta
  const meta: MetaJson = {
    state: targetState,
    congress,
    session,
    generated_at: generatedAt,
    cutoff_date_et: cutoffDateEt,
    target_vote_date: targetVoteDate,
    keys: {
      latest: `state/${targetState}/latest.json`,
      snapshot: `state/${targetState}/${targetVoteDate}.json`,
    },
    stats: {
      votes_total: votesTotal,
      votes_with_state_members: votesWithStateMembers,
      state_member_votes: stateMemberVotes,
    },
    partial,
    missing_votes: missingVotes,
  };

  console.log(`[ingest] Ingestion complete:`);
  console.log(`  - Target vote date: ${targetVoteDate}`);
  console.log(`  - Votes total: ${votesTotal}`);
  console.log(`  - Votes with ${targetState} members: ${votesWithStateMembers}`);
  console.log(`  - State member votes: ${stateMemberVotes}`);
  console.log(`  - Partial: ${partial}`);
  if (partial) {
    console.log(`  - Missing votes: ${missingVotes.join(", ")}`);
  }

  return {
    success: true,
    targetVoteDate,
    cutoffDateEt,
    votesTotal,
    votesWithStateMembers,
    stateMemberVotes,
    partial,
    missingVotes,
    snapshot,
    meta,
  };
}

// ============================================================================
// Output Building Helpers
// ============================================================================

/**
 * Build output vote records with state-filtered members.
 *
 * @param details - Parsed vote details
 * @param summaries - Vote summaries (for fallback title/result)
 * @param targetState - State code to filter members
 * @returns Output votes and total state member vote count
 */
function buildOutputVotes(
  details: VoteDetails[],
  summaries: VoteSummary[],
  targetState: string
): { outputVotes: OutputVote[]; stateMemberVotes: number } {
  const summaryMap = new Map(summaries.map((s) => [s.vote_number, s]));
  const outputVotes: OutputVote[] = [];
  let stateMemberVotes = 0;

  for (const detail of details) {
    // Filter members to target state
    const stateMembers = filterMembersByState(
      detail.member_votes,
      targetState
    );

    // Skip votes with no members from target state
    if (stateMembers.length === 0) {
      continue;
    }

    stateMemberVotes += stateMembers.length;

    // Get summary for fallbacks
    const summary = summaryMap.get(detail.vote_number);

    // Build output members
    const outputMembers: OutputMember[] = stateMembers.map((m) => ({
      name: m.member_full,
      state: m.state,
      party: m.party,
      vote_cast: m.vote_cast,
    }));

    // Build output counts (convert not_voting to absent per spec)
    const outputCounts: OutputCounts = {
      yeas: detail.counts.yeas,
      nays: detail.counts.nays,
      present: detail.counts.present,
      absent: detail.counts.not_voting,
    };

    // Build output vote
    const outputVote: OutputVote = {
      vote_number: detail.vote_number,
      title: detail.vote_title || summary?.title || "Unknown Vote",
      question: detail.vote_question || "",
      result: detail.vote_result || summary?.result || "",
      counts: outputCounts,
      members: outputMembers,
    };

    // Add issue if we can extract it from the title/question
    const issue = extractIssue(detail);
    if (issue) {
      outputVote.issue = issue;
    }

    outputVotes.push(outputVote);
  }

  // Sort by vote number
  outputVotes.sort((a, b) => a.vote_number - b.vote_number);

  return { outputVotes, stateMemberVotes };
}

/**
 * Extract issue/bill reference from vote details.
 *
 * Looks for patterns like "S. 1234", "H.R. 5678", "PN123" in title/question.
 */
function extractIssue(detail: VoteDetails): string | undefined {
  const text = `${detail.vote_title} ${detail.vote_question}`;

  // Match common bill/document patterns
  const patterns = [
    /\b(S\.\s*\d+)\b/i, // S. 1234
    /\b(H\.R\.\s*\d+)\b/i, // H.R. 5678
    /\b(H\.\s*Res\.\s*\d+)\b/i, // H. Res. 123
    /\b(S\.\s*Res\.\s*\d+)\b/i, // S. Res. 123
    /\b(H\.\s*J\.\s*Res\.\s*\d+)\b/i, // H. J. Res. 123
    /\b(S\.\s*J\.\s*Res\.\s*\d+)\b/i, // S. J. Res. 123
    /\b(H\.\s*Con\.\s*Res\.\s*\d+)\b/i, // H. Con. Res. 123
    /\b(S\.\s*Con\.\s*Res\.\s*\d+)\b/i, // S. Con. Res. 123
    /\b(PN\s*\d+)\b/i, // PN123 (Presidential Nomination)
    /\b(Treaty Doc\.\s*\d+-\d+)\b/i, // Treaty Doc. 119-1
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Normalize whitespace
      return match[1].replace(/\s+/g, " ");
    }
  }

  return undefined;
}

// ============================================================================
// Exports for Testing
// ============================================================================

export { buildOutputVotes, extractIssue };


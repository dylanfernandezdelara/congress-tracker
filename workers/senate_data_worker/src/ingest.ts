/**
 * Ingestion orchestration for Senate vote data.
 *
 * Coordinates:
 * - Target date selection (latest vote date on or before today ET)
 * - Vote menu fetching and parsing
 * - Vote detail fetching (parallel with retry)
 * - State filtering and JSON output building
 */

import { todayEastern, findMaxDateOnOrBefore } from "./date-parse";
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
import { buildBillKey, fetchBillDetailsMap } from "./congress";
import {
  readIngestedVoteDetailsFromD1,
  readKnownVoteNumbersFromD1,
  writeIngestedVoteDetailsToD1,
} from "./d1";
import { buildStateKeys } from "./storage";
import type {
  IngestConfig,
  IngestResult,
  MultiStateIngestResult,
  SnapshotJson,
  MetaJson,
  OutputVote,
  OutputMember,
  OutputCounts,
  BillRef,
  VoteLedger,
  VoteLedgerEntry,
  SessionOverview,
  SenatorSessionStat,
  MemberIndexJson,
  MemberIndexEntry,
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

interface IngestionContext {
  success: boolean;
  error?: string;
  targetVoteDate: string | null;
  cutoffDateEt: string;
  generatedAt: string;
  votesTotal: number;
  partial: boolean;
  missingVotes: number[];
  targetVotes: VoteSummary[];
  parsedDetails: VoteDetails[];
  congress: number;
  session: number;
}

export interface VoteLedgerDiscovery {
  eligibleVotes: VoteSummary[];
  existingVoteNumbers: Set<number>;
  missingVoteNumbers: number[];
  cutoffDateEt: string;
  latestEligibleVoteDate: string | null;
}

export interface VoteLedgerUpdateOptions {
  db?: D1Database;
  discovery?: VoteLedgerDiscovery;
}

// ============================================================================
// Main Ingestion Function
// ============================================================================

async function buildIngestionContext(
  config: IngestConfig,
  fetchConfig: FetchConfig
): Promise<IngestionContext> {
  const { congress, session, targetState } = config;
  const state = targetState.trim().toUpperCase();
  const cutoffDateEt = todayEastern();
  const generatedAt = new Date().toISOString();

  console.log(
    `[ingest] Starting ingestion: congress=${congress}, session=${session}, state=${state}`
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
      generatedAt,
      votesTotal: 0,
      partial: false,
      missingVotes: [],
      targetVotes: [],
      parsedDetails: [],
      congress,
      session,
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
      generatedAt,
      votesTotal: 0,
      partial: false,
      missingVotes: [],
      targetVotes: [],
      parsedDetails: [],
      congress,
      session,
      error: "No votes found in vote menu",
    };
  }

  // -------------------------------------------------------------------------
  // Step 3: Select target date
  // -------------------------------------------------------------------------
  const uniqueDates = getUniqueDates(allVotes);
  console.log(`[ingest] Unique vote dates: ${uniqueDates.join(", ")}`);

  const targetVoteDate = findMaxDateOnOrBefore(uniqueDates, cutoffDateEt);

  if (!targetVoteDate) {
    console.warn(`[ingest] No vote dates found on or before cutoff ${cutoffDateEt}`);
    return {
      success: false,
      targetVoteDate: null,
      cutoffDateEt,
      generatedAt,
      votesTotal: 0,
      partial: false,
      missingVotes: [],
      targetVotes: [],
      parsedDetails: [],
      congress,
      session,
      error: `No vote dates found on or before cutoff ${cutoffDateEt}`,
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
      generatedAt,
      votesTotal: 0,
      partial: false,
      missingVotes: [],
      targetVotes: [],
      parsedDetails: [],
      congress,
      session,
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
  // Step 6: Parse vote details
  // -------------------------------------------------------------------------
  console.log("[ingest] Parsing vote details...");
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

  const partial = missingVotes.length > 0;

  return {
    success: true,
    targetVoteDate,
    cutoffDateEt,
    generatedAt,
    votesTotal: targetVotes.length,
    partial,
    missingVotes,
    targetVotes,
    parsedDetails,
    congress,
    session,
  };
}

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
  const state = config.targetState.trim().toUpperCase();
  const context = await buildIngestionContext(config, fetchConfig);
  if (!context.success) {
    return {
      success: false,
      targetVoteDate: context.targetVoteDate,
      cutoffDateEt: context.cutoffDateEt,
      votesTotal: context.votesTotal,
      votesWithStateMembers: 0,
      stateMemberVotes: 0,
      partial: context.partial,
      missingVotes: context.missingVotes,
      snapshot: null,
      meta: null,
      error: context.error,
    };
  }

  const billRefs = collectBillRefs(context.parsedDetails);
  const billDetailsByKey =
    billRefs.length > 0
      ? await fetchBillDetailsMap(
          billRefs,
          config.congressApiKey,
          fetchConfig
        )
      : new Map();

  console.log("[ingest] Building output JSON...");
  const { outputVotes, stateMemberVotes } = buildOutputVotes(
    context.parsedDetails,
    context.targetVotes,
    state,
    billDetailsByKey
  );

  const votesTotal = context.votesTotal;
  const votesWithStateMembers = outputVotes.length;
  const partial = context.partial;

  // Build snapshot
  const snapshot: SnapshotJson = {
    state,
    vote_date: context.targetVoteDate ?? "",
    generated_at: context.generatedAt,
    congress: context.congress,
    session: context.session,
    votes: outputVotes,
  };

  const keys = buildStateKeys(state, snapshot.vote_date);

  // Build meta
  const meta: MetaJson = {
    state,
    congress: context.congress,
    session: context.session,
    generated_at: context.generatedAt,
    cutoff_date_et: context.cutoffDateEt,
    target_vote_date: snapshot.vote_date,
    keys: {
      latest: keys.latest,
      snapshot: keys.snapshot,
    },
    stats: {
      votes_total: votesTotal,
      votes_with_state_members: votesWithStateMembers,
      state_member_votes: stateMemberVotes,
    },
    partial,
    missing_votes: context.missingVotes,
  };

  console.log(`[ingest] Ingestion complete:`);
  console.log(`  - Target vote date: ${snapshot.vote_date}`);
  console.log(`  - Votes total: ${votesTotal}`);
  console.log(`  - Votes with ${state} members: ${votesWithStateMembers}`);
  console.log(`  - State member votes: ${stateMemberVotes}`);
  console.log(`  - Partial: ${partial}`);
  if (partial) {
    console.log(`  - Missing votes: ${context.missingVotes.join(", ")}`);
  }

  return {
    success: true,
    targetVoteDate: snapshot.vote_date,
    cutoffDateEt: context.cutoffDateEt,
    votesTotal,
    votesWithStateMembers,
    stateMemberVotes,
    partial,
    missingVotes: context.missingVotes,
    snapshot,
    meta,
  };
}

export async function runIngestionAllStates(
  config: IngestConfig,
  states: string[],
  fetchConfig: FetchConfig = DEFAULT_FETCH_CONFIG
): Promise<MultiStateIngestResult> {
  const context = await buildIngestionContext(config, fetchConfig);
  if (!context.success) {
    return {
      success: false,
      targetVoteDate: context.targetVoteDate,
      cutoffDateEt: context.cutoffDateEt,
      votesTotal: context.votesTotal,
      partial: context.partial,
      missingVotes: context.missingVotes,
      generatedAt: context.generatedAt,
      perState: {},
      error: context.error,
    };
  }

  const billRefs = collectBillRefs(context.parsedDetails);
  const billDetailsByKey =
    billRefs.length > 0
      ? await fetchBillDetailsMap(
          billRefs,
          config.congressApiKey,
          fetchConfig
        )
      : new Map();

  const perState: MultiStateIngestResult["perState"] = {};
  for (const state of states) {
    const normalized = state.trim().toUpperCase();
    const { outputVotes, stateMemberVotes } = buildOutputVotes(
      context.parsedDetails,
      context.targetVotes,
      normalized,
      billDetailsByKey
    );
    const snapshot: SnapshotJson = {
      state: normalized,
      vote_date: context.targetVoteDate ?? "",
      generated_at: context.generatedAt,
      congress: context.congress,
      session: context.session,
      votes: outputVotes,
    };
    const keys = buildStateKeys(normalized, snapshot.vote_date);
    const meta: MetaJson = {
      state: normalized,
      congress: context.congress,
      session: context.session,
      generated_at: context.generatedAt,
      cutoff_date_et: context.cutoffDateEt,
      target_vote_date: snapshot.vote_date,
      keys: {
        latest: keys.latest,
        snapshot: keys.snapshot,
      },
      stats: {
        votes_total: context.votesTotal,
        votes_with_state_members: outputVotes.length,
        state_member_votes: stateMemberVotes,
      },
      partial: context.partial,
      missing_votes: context.missingVotes,
    };
    perState[normalized] = {
      snapshot,
      meta,
      votesWithStateMembers: outputVotes.length,
      stateMemberVotes,
    };
  }

  return {
    success: true,
    targetVoteDate: context.targetVoteDate,
    cutoffDateEt: context.cutoffDateEt,
    votesTotal: context.votesTotal,
    partial: context.partial,
    missingVotes: context.missingVotes,
    generatedAt: context.generatedAt,
    perState,
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
  targetState: string,
  billDetailsByKey: Map<string, BillRef> = new Map()
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
      const issueRef = parseIssueRef(issue, detail.congress);
      outputVote.issue_type = issueRef.issue_type;
      if (issueRef.bill) {
        const billKey = buildBillKey(issueRef.bill);
        const billDetails = billDetailsByKey.get(billKey);
        outputVote.bill = billDetails
          ? { ...issueRef.bill, ...billDetails }
          : issueRef.bill;
      }
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
  const text = `${detail.vote_document ?? ""} ${detail.vote_title} ${detail.vote_question}`;

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

type IssueType = "bill" | "nomination" | "treaty" | "other";

function parseIssueRef(issue: string, congress: number): {
  issue_type: IssueType;
  bill?: BillRef;
} {
  const trimmed = issue.trim();
  if (!trimmed) return { issue_type: "other" };

  const nominationMatch = trimmed.match(/PN\s*(\d+)/i);
  if (nominationMatch) {
    return { issue_type: "nomination" };
  }

  const treatyMatch = trimmed.match(/Treaty Doc\.\s*(\d+)-(\d+)/i);
  if (treatyMatch) {
    return { issue_type: "treaty" };
  }

  const billPatterns: Array<{ pattern: RegExp; type: string }> = [
    { pattern: /^H\.\s*Con\.\s*Res\./i, type: "H. Con. Res." },
    { pattern: /^S\.\s*Con\.\s*Res\./i, type: "S. Con. Res." },
    { pattern: /^H\.\s*J\.\s*Res\./i, type: "H. J. Res." },
    { pattern: /^S\.\s*J\.\s*Res\./i, type: "S. J. Res." },
    { pattern: /^H\.\s*Res\./i, type: "H. Res." },
    { pattern: /^S\.\s*Res\./i, type: "S. Res." },
    { pattern: /^H\.R\./i, type: "H.R." },
    { pattern: /^S\./i, type: "S." },
  ];

  for (const entry of billPatterns) {
    if (entry.pattern.test(trimmed)) {
      const numberMatch = trimmed.match(/(\d+)/);
      if (!numberMatch) break;
      const number = numberMatch[1];
      return {
        issue_type: "bill",
        bill: {
          congress,
          type: entry.type,
          number,
        },
      };
    }
  }

  return { issue_type: "other" };
}

function collectBillRefs(details: VoteDetails[]): BillRef[] {
  const refs: BillRef[] = [];
  for (const detail of details) {
    const issue = extractIssue(detail);
    if (!issue) continue;
    const parsed = parseIssueRef(issue, detail.congress);
    if (parsed.bill) {
      refs.push(parsed.bill);
    }
  }
  return refs;
}

// ============================================================================
// Vote Ledger Building
// ============================================================================

function buildMemberLookup(
  members: MemberIndexEntry[]
): Map<string, MemberIndexEntry[]> {
  const byState = new Map<string, MemberIndexEntry[]>();
  for (const m of members) {
    const state = m.state.toUpperCase();
    const list = byState.get(state) ?? [];
    list.push(m);
    byState.set(state, list);
  }
  return byState;
}

function extractLastName(raw: string): string {
  const withoutParens = raw.replace(/\s*\(.*\)\s*$/, "").trim();
  if (withoutParens.includes(",")) {
    return withoutParens.split(",")[0].trim().toLowerCase();
  }
  const parts = withoutParens.split(/\s+/);
  return (parts[parts.length - 1] ?? withoutParens).toLowerCase();
}

function extractFirstInitial(raw: string): string | undefined {
  const withoutParens = raw.replace(/\s*\(.*\)\s*$/, "").trim();
  if (withoutParens.includes(",")) {
    const rest = withoutParens.split(",")[1]?.trim();
    return rest ? rest[0]?.toLowerCase() : undefined;
  }
  return withoutParens.split(/\s+/)[0]?.[0]?.toLowerCase();
}

function resolveBioguideId(
  memberFull: string,
  state: string,
  membersByState: Map<string, MemberIndexEntry[]>
): string | null {
  const candidates = membersByState.get(state.toUpperCase()) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].bioguide_id;

  const lastName = extractLastName(memberFull);
  const lastMatch = candidates.filter(
    (m) => extractLastName(m.name) === lastName
  );
  if (lastMatch.length === 1) return lastMatch[0].bioguide_id;

  if (lastMatch.length > 1) {
    const initial = extractFirstInitial(memberFull);
    if (initial) {
      const firstMatch = lastMatch.filter(
        (m) => extractFirstInitial(m.name) === initial
      );
      if (firstMatch.length >= 1) return firstMatch[0].bioguide_id;
    }
    return lastMatch[0].bioguide_id;
  }

  return candidates[0].bioguide_id;
}

function buildLedgerEntry(
  detail: VoteDetails,
  summary: VoteSummary | undefined,
  membersByState: Map<string, MemberIndexEntry[]>
): VoteLedgerEntry {
  const memberVotes: Record<string, string> = {};
  for (const mv of detail.member_votes) {
    const bioguide = resolveBioguideId(mv.member_full, mv.state, membersByState);
    if (bioguide) {
      memberVotes[bioguide] = mv.vote_cast;
    }
  }

  return {
    vote_number: detail.vote_number,
    vote_date: detail.vote_date,
    title: detail.vote_title || summary?.title || "Unknown Vote",
    question: detail.vote_question || "",
    result: detail.vote_result || summary?.result || "",
    issue: extractIssue(detail) ?? undefined,
    member_votes: memberVotes,
  };
}

function computePartyMajority(
  entry: VoteLedgerEntry,
  partyByBioguide: Map<string, string>
): Map<string, string> {
  const partyTally = new Map<string, { yea: number; nay: number }>();
  for (const [bioguide, cast] of Object.entries(entry.member_votes)) {
    const party = partyByBioguide.get(bioguide);
    if (!party) continue;
    const normalized = cast.toLowerCase();
    const isYea = normalized.includes("yea") || normalized.includes("aye") || normalized === "yes";
    const isNay = normalized.includes("nay") || normalized === "no";
    if (!isYea && !isNay) continue;
    const tally = partyTally.get(party) ?? { yea: 0, nay: 0 };
    if (isYea) tally.yea++;
    if (isNay) tally.nay++;
    partyTally.set(party, tally);
  }
  const result = new Map<string, string>();
  for (const [party, tally] of partyTally) {
    result.set(party, tally.yea >= tally.nay ? "Yea" : "Nay");
  }
  return result;
}

function computeSessionOverview(
  ledger: VoteLedger,
  membersIndex: MemberIndexJson
): SessionOverview {
  const partyByBioguide = new Map<string, string>();
  for (const m of membersIndex.members) {
    partyByBioguide.set(m.bioguide_id, m.party);
  }

  const stats = new Map<string, {
    member: MemberIndexEntry;
    cast: number;
    missed: number;
    defections: number;
    withMajority: number;
    aligned: number;
  }>();
  for (const m of membersIndex.members) {
    stats.set(m.bioguide_id, {
      member: m,
      cast: 0, missed: 0, defections: 0, withMajority: 0, aligned: 0,
    });
  }

  let totalDefections = 0;
  let latestVoteDate = "";

  for (const entry of ledger.entries) {
    if (entry.vote_date > latestVoteDate) latestVoteDate = entry.vote_date;
    const partyMajority = computePartyMajority(entry, partyByBioguide);

    for (const m of membersIndex.members) {
      const stat = stats.get(m.bioguide_id)!;
      const voteCast = entry.member_votes[m.bioguide_id];
      if (!voteCast || voteCast.toLowerCase().includes("not voting")) {
        stat.missed++;
        continue;
      }
      stat.cast++;

      const majority = partyMajority.get(m.party);
      if (majority) {
        stat.withMajority++;
        const normalizedCast = voteCast.toLowerCase();
        const castIsYea = normalizedCast.includes("yea") || normalizedCast.includes("aye") || normalizedCast === "yes";
        const majorityIsYea = majority === "Yea";
        if (castIsYea === majorityIsYea) {
          stat.aligned++;
        } else {
          stat.defections++;
          totalDefections++;
        }
      }
    }
  }

  const senators: SenatorSessionStat[] = [];
  for (const [bioguide, s] of stats) {
    senators.push({
      bioguide_id: bioguide,
      name: s.member.name,
      party: s.member.party,
      state: s.member.state,
      votes_cast: s.cast,
      votes_missed: s.missed,
      party_defections: s.defections,
      alignment_pct: s.withMajority > 0
        ? Math.round((s.aligned / s.withMajority) * 100)
        : 100,
    });
  }

  return {
    congress: ledger.congress,
    session: ledger.session,
    generated_at: new Date().toISOString(),
    total_votes: ledger.total_votes,
    latest_vote_date: latestVoteDate,
    total_defections: totalDefections,
    senators,
  };
}

export async function discoverVoteLedgerUpdates(
  config: IngestConfig,
  existingLedger: VoteLedger | null,
  options: { db?: D1Database; fetchConfig?: FetchConfig } = {}
): Promise<VoteLedgerDiscovery> {
  const { congress, session } = config;

  console.log("[ledger] Fetching vote menu for ledger discovery...");
  const menuResult = await fetchVoteMenu(congress, session, options.fetchConfig ?? DEFAULT_FETCH_CONFIG);
  if (!menuResult.success || !menuResult.data) {
    console.warn(`[ledger] Failed to fetch vote menu: ${menuResult.error}`);
    const existingVoteNumbers = new Set((existingLedger?.entries ?? []).map((e) => e.vote_number));
    if (options.db) {
      for (const voteNumber of await readKnownVoteNumbersFromD1(options.db, congress, session)) {
        existingVoteNumbers.add(voteNumber);
      }
    }
    return {
      eligibleVotes: [],
      existingVoteNumbers,
      missingVoteNumbers: [],
      cutoffDateEt: todayEastern(),
      latestEligibleVoteDate: null,
    };
  }

  const allMenuVotes = parseVoteMenuXml(menuResult.data);
  const cutoff = todayEastern();
  const eligibleVotes = allMenuVotes.filter((v) => v.vote_date < cutoff);

  console.log(`[ledger] Menu has ${allMenuVotes.length} votes, ${eligibleVotes.length} before cutoff`);

  const existingVoteNumbers = new Set(
    (existingLedger?.entries ?? []).map((e) => e.vote_number)
  );
  if (options.db) {
    for (const voteNumber of await readKnownVoteNumbersFromD1(options.db, congress, session)) {
      existingVoteNumbers.add(voteNumber);
    }
  }
  const missingVoteNumbers = eligibleVotes
    .filter((v) => !existingVoteNumbers.has(v.vote_number))
    .map((v) => v.vote_number);

  console.log(`[ledger] Known ingestion state has ${existingVoteNumbers.size} entries, ${missingVoteNumbers.length} new`);

  return {
    eligibleVotes,
    existingVoteNumbers,
    missingVoteNumbers,
    cutoffDateEt: cutoff,
    latestEligibleVoteDate: findMaxDateOnOrBefore(eligibleVotes.map((v) => v.vote_date), cutoff),
  };
}

/**
 * Build or update the vote ledger incrementally.
 *
 * Fetches vote details for any votes not already in D1/R2 ingestion state,
 * merges them in, and computes session overview stats.
 */
export async function buildVoteLedgerUpdate(
  config: IngestConfig,
  membersIndex: MemberIndexJson,
  existingLedger: VoteLedger | null,
  fetchConfig: FetchConfig = DEFAULT_FETCH_CONFIG,
  options: VoteLedgerUpdateOptions = {}
): Promise<{ ledger: VoteLedger; overview: SessionOverview }> {
  const { congress, session } = config;
  const discovery =
    options.discovery ??
    (await discoverVoteLedgerUpdates(config, existingLedger, {
      db: options.db,
      fetchConfig,
    }));
  const eligibleVotes = discovery.eligibleVotes;

  if (eligibleVotes.length === 0) {
    const empty: VoteLedger = existingLedger ?? {
      congress, session, generated_at: new Date().toISOString(),
      total_votes: 0, entries: [],
    };
    return { ledger: empty, overview: computeSessionOverview(empty, membersIndex) };
  }

  const existingLedgerNumbers = new Set((existingLedger?.entries ?? []).map((e) => e.vote_number));
  const candidateCachedVoteNumbers = eligibleVotes
    .map((v) => v.vote_number)
    .filter((voteNumber) => !existingLedgerNumbers.has(voteNumber));
  const cachedDetailsByNumber = options.db
    ? await readIngestedVoteDetailsFromD1(options.db, congress, session, candidateCachedVoteNumbers)
    : new Map<number, VoteDetails>();
  const cachedVoteNumbers = new Set(cachedDetailsByNumber.keys());
  const missingVotes = eligibleVotes.filter(
    (v) => !existingLedgerNumbers.has(v.vote_number) && !cachedVoteNumbers.has(v.vote_number)
  );

  let newDetails: VoteDetails[] = [];
  if (missingVotes.length > 0) {
    const voteNumbers = missingVotes.map((v) => v.vote_number);
    console.log(`[ledger] Fetching ${voteNumbers.length} vote details...`);
    const results = await fetchVoteDetailsParallel(voteNumbers, congress, session, fetchConfig);
    console.log(`[ledger] Fetched: ${results.successCount} success, ${results.failureCount} failed`);

    for (const voteNum of voteNumbers) {
      const fr = results.results.get(voteNum);
      if (!fr?.success || !fr.data) continue;
      const parsed = parseVoteDetailXml(fr.data, congress, session);
      if (parsed) newDetails.push(parsed);
    }
    if (options.db && newDetails.length > 0) {
      await writeIngestedVoteDetailsToD1(options.db, newDetails);
    }
  }

  const membersByState = buildMemberLookup(membersIndex.members);
  const summaryMap = new Map(eligibleVotes.map((v) => [v.vote_number, v]));

  const cachedDetails = Array.from(cachedDetailsByNumber.values());
  const newEntries = [...cachedDetails, ...newDetails].map((detail) =>
    buildLedgerEntry(detail, summaryMap.get(detail.vote_number), membersByState)
  );

  const allEntries = [...(existingLedger?.entries ?? []), ...newEntries]
    .sort((a, b) => b.vote_number - a.vote_number);

  const ledger: VoteLedger = {
    congress,
    session,
    generated_at: new Date().toISOString(),
    total_votes: allEntries.length,
    entries: allEntries,
  };

  const overview = computeSessionOverview(ledger, membersIndex);

  console.log(`[ledger] Ledger updated: ${ledger.total_votes} total votes, ${overview.total_defections} total defections`);

  return { ledger, overview };
}

// ============================================================================
// Exports for Testing
// ============================================================================

export { buildOutputVotes, extractIssue, parseIssueRef };

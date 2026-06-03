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
  getUniqueDates,
  type VoteSummary,
  type VoteDetails,
} from "./xml";
import { computePartyMajorityLabels } from "./domain/party-majority";
import {
  readIngestedVoteDetailsFromD1,
  readKnownVoteNumbersFromD1,
  writeIngestedVoteDetailsToD1,
} from "./d1/ingested-votes";
import type {
  IngestConfig,
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
  /** Reference instant for the Eastern-time cutoff (injected via Runtime.clock). */
  now?: Date;
  /** Pre-fetched + parsed vote menu, shared across the run to avoid re-fetching. */
  menuVotes?: VoteSummary[];
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
    const partyMajority = computePartyMajorityLabels(entry, partyByBioguide);

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
  options: {
    db?: D1Database;
    fetchConfig?: FetchConfig;
    now?: Date;
    /** Pre-fetched + parsed vote menu, shared across the run to avoid re-fetching. */
    menuVotes?: VoteSummary[];
  } = {}
): Promise<VoteLedgerDiscovery> {
  const { congress, session } = config;
  const now = options.now ?? new Date();

  let allMenuVotes = options.menuVotes;
  if (!allMenuVotes) {
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
        cutoffDateEt: todayEastern(now),
        latestEligibleVoteDate: null,
      };
    }
    allMenuVotes = parseVoteMenuXml(menuResult.data);
  }

  const cutoff = todayEastern(now);
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
 * Fetches vote details for any votes not already in D1 ingestion state,
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
      now: options.now,
      menuVotes: options.menuVotes,
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

export { extractIssue, parseIssueRef };

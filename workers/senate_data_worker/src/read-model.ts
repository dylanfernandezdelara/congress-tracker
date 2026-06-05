import type { ActivityIndexJson, BillRef, PartyPositionAnalysis, SessionOverview, VoteLedger, VoteLedgerEntry } from "./types";
import type {
  ArgumentExcerpt,
  BriefingCrossover,
  BriefingFeedItem,
  BriefingFeedResponse,
  BriefingVoteSummary,
  PartyArgumentSummary,
  PipelineMaterialization,
  SourceCoverage,
  VoteDetailResponse,
  VotePartyBreakdown,
  VoteStatus,
} from "./platform-types";
import { buildIssueKey, buildThreadKey, extractNominationOffice } from "./domain/issue-keys";
import { computePartyMajority } from "./domain/party-majority";
import { classifyVote } from "./domain/vote-cast";
import { toStatus } from "./domain/vote-status";
import { buildVoteContentContext, describeProcedure } from "./vote-content-profile";

export { buildIssueKey, buildThreadKey } from "./domain/issue-keys";

/** Homepage feed caps at this many votes, newest date first (no relevance ranking). */
export const BRIEFING_FEED_ITEM_LIMIT = 15;

function buildBillLookup(activities: ActivityIndexJson | null): Map<number, BillRef> {
  const map = new Map<number, BillRef>();
  if (!activities) return map;
  for (const activity of activities.activities) {
    if (activity.type !== "roll_call_vote" || !activity.bill) continue;
    const last = activity.activity_id.split(":").at(-1);
    const voteNumber = Number(last);
    if (!Number.isNaN(voteNumber)) map.set(voteNumber, activity.bill);
  }
  return map;
}

function cleanSummary(bill: BillRef | undefined): string | null {
  const normalizeSummary = (value: string | undefined): string | null => {
    const cleaned = value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return null;
    const title = bill?.title?.trim();
    if (!title) return cleaned;
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return cleaned.replace(new RegExp(`^${escapedTitle}\\s*[:.-]*\\s*`, "i"), "").trim() || cleaned;
  };

  return normalizeSummary(bill?.summary) ?? normalizeSummary(bill?.analysis?.plain_summary);
}

function extractCategory(entry: VoteLedgerEntry, bill: BillRef | undefined): string {
  const procedure = describeProcedure(entry);
  return (
    bill?.analysis?.category?.trim() ||
    bill?.policy_area?.trim() ||
    entry.policy_area?.trim() ||
    (procedure ? "Floor Procedure" : undefined) ||
    (entry.issue?.startsWith("PN") ? "Nomination" : "Senate business")
  );
}

function extractConfirmationTarget(title: string): string | null {
  const match = /^confirmation:\s*(.+)$/i.exec(title.trim());
  return match?.[1]?.trim() || null;
}

function buildIssueLabel(entry: VoteLedgerEntry, bill: BillRef | undefined): string {
  if (entry.issue?.trim()) return entry.issue.trim();
  if (bill?.type && bill.number) return `${bill.type} ${bill.number}`;
  return "the measure";
}

function buildIssueTitle(entry: VoteLedgerEntry, bill: BillRef | undefined): string {
  return extractNominationOffice(entry.title) ?? bill?.title ?? entry.title;
}

function computeTallies(entry: VoteLedgerEntry, overview: SessionOverview): BriefingVoteSummary {
  let yea = 0;
  let nay = 0;
  let present = 0;
  let absent = 0;
  const known = new Set(overview.senators.map((s) => s.bioguide_id));

  for (const cast of Object.values(entry.member_votes)) {
    const vote = classifyVote(cast);
    if (vote === "yea") yea++;
    else if (vote === "nay") nay++;
    else if (vote === "present") present++;
    else absent++;
  }

  absent += Math.max(0, known.size - Object.keys(entry.member_votes).length);
  return { yea, nay, present, absent };
}

function buildPartyMaps(overview: SessionOverview): {
  partyById: Map<string, string>;
  nameById: Map<string, string>;
  stateById: Map<string, string>;
} {
  const partyById = new Map<string, string>();
  const nameById = new Map<string, string>();
  const stateById = new Map<string, string>();
  for (const senator of overview.senators) {
    partyById.set(senator.bioguide_id, senator.party);
    nameById.set(senator.bioguide_id, senator.name);
    stateById.set(senator.bioguide_id, senator.state);
  }
  return { partyById, nameById, stateById };
}

function computeCrossovers(entry: VoteLedgerEntry, overview: SessionOverview): BriefingCrossover[] {
  const { partyById, nameById, stateById } = buildPartyMaps(overview);
  const majority = computePartyMajority(entry, partyById);
  const crossovers: BriefingCrossover[] = [];

  for (const [bioguideId, rawCast] of Object.entries(entry.member_votes)) {
    const party = partyById.get(bioguideId);
    if (!party) continue;
    const cast = classifyVote(rawCast);
    const majorityVote = majority.get(party);
    if (!majorityVote || (cast !== "yea" && cast !== "nay") || majorityVote === cast) continue;
    crossovers.push({
      bioguide_id: bioguideId,
      name: (nameById.get(bioguideId) ?? bioguideId).split(",")[0],
      party,
      state: stateById.get(bioguideId) ?? "",
      vote_cast: cast,
    });
  }

  return crossovers.sort((a, b) => a.party.localeCompare(b.party) || a.name.localeCompare(b.name));
}

function computePartyBreakdown(entry: VoteLedgerEntry, overview: SessionOverview): VotePartyBreakdown[] {
  const { partyById } = buildPartyMaps(overview);
  const partyBreakdown = new Map<string, VotePartyBreakdown>();
  const majority = computePartyMajority(entry, partyById);

  for (const senator of overview.senators) {
    if (!partyBreakdown.has(senator.party)) {
      partyBreakdown.set(senator.party, {
        party: senator.party,
        yea: 0,
        nay: 0,
        present: 0,
        not_voting: 0,
        majority_vote: majority.get(senator.party),
      });
    }
  }

  for (const [bioguideId, rawCast] of Object.entries(entry.member_votes)) {
    const party = partyById.get(bioguideId);
    if (!party) continue;
    const breakdown = partyBreakdown.get(party);
    if (!breakdown) continue;
    const cast = classifyVote(rawCast);
    if (cast === "yea") breakdown.yea += 1;
    else if (cast === "nay") breakdown.nay += 1;
    else if (cast === "present") breakdown.present += 1;
    else breakdown.not_voting += 1;
  }

  return Array.from(partyBreakdown.values()).sort((a, b) => a.party.localeCompare(b.party));
}

function buildCoverage(bill: BillRef | undefined, hasRecordData = false, hasFloorLogs = false): SourceCoverage {
  const hasBillContext = Boolean(bill?.summary || bill?.analysis || bill?.policy_area);
  const hasModelSummary = Boolean(bill?.analysis);
  const level: SourceCoverage["level"] =
    hasBillContext && (hasRecordData || hasFloorLogs)
      ? "full"
      : hasBillContext || hasModelSummary
        ? "partial"
        : "minimal";

  return {
    level,
    vote_data: true,
    bill_context: hasBillContext,
    congressional_record: hasRecordData,
    floor_logs: hasFloorLogs,
    model_summary: hasModelSummary,
    note:
      hasRecordData || hasFloorLogs
        ? undefined
        : "Vote and bill context are available; linked official record excerpts are not populated for this vote.",
  };
}

function buildSummary(entry: VoteLedgerEntry, bill: BillRef | undefined, tally: BriefingVoteSummary): string {
  const summary = cleanSummary(bill);
  if (summary) return summary;

  const confirmationTarget = extractConfirmationTarget(entry.title);
  if (confirmationTarget) {
    return `The Senate voted on whether to confirm ${confirmationTarget}.`;
  }

  if (entry.issue?.startsWith("PN")) {
    return "The Senate voted on whether to confirm a federal nominee to a federal post.";
  }

  const procedure = describeProcedure(entry);
  const issueLabel = buildIssueLabel(entry, bill);
  if (procedure?.kind === "motion_to_discharge") {
    return `The Senate voted ${tally.yea}-${tally.nay} on whether to pull ${issueLabel} out of committee for floor consideration. No official bill summary is available in the current feed.`;
  }
  if (procedure?.kind === "point_of_order") {
    return `The Senate voted ${tally.yea}-${tally.nay} on a parliamentary ruling tied to ${issueLabel}. No official bill summary is available in the current feed.`;
  }
  if (procedure?.kind === "motion_to_proceed") {
    return `The Senate voted ${tally.yea}-${tally.nay} on whether to open floor debate on ${issueLabel}. No official bill summary is available in the current feed.`;
  }
  if (procedure?.kind === "cloture") {
    return `The Senate voted ${tally.yea}-${tally.nay} on whether to limit debate and move ${issueLabel} toward a final vote. No official bill summary is available in the current feed.`;
  }
  if (procedure) {
    return `The Senate voted ${tally.yea}-${tally.nay} on a floor procedure related to ${issueLabel}. No official bill summary is available in the current feed.`;
  }

  if (Math.abs(tally.yea - tally.nay) <= 5) {
    return `The Senate voted ${tally.yea}-${tally.nay} on this measure. No official bill summary is available in the current feed.`;
  }

  return `The Senate recorded a ${tally.yea}-${tally.nay} vote. No official bill summary is available in the current feed.`;
}

function buildFeedItem(
  ledger: VoteLedger,
  overview: SessionOverview,
  entry: VoteLedgerEntry,
  billLookup: Map<number, BillRef>
): BriefingFeedItem {
  const bill = billLookup.get(entry.vote_number);
  const tally = computeTallies(entry, overview);
  const crossovers = computeCrossovers(entry, overview);
  const procedure = describeProcedure(entry);
  const profile = buildVoteContentContext(ledger, entry, bill, procedure);
  const summary = buildSummary(entry, bill, tally);
  const category = extractCategory(entry, bill);
  const status = toStatus(entry.result);

  return {
    id: `${ledger.congress}:${ledger.session}:${entry.vote_number}`,
    congress: ledger.congress,
    session: ledger.session,
    vote_number: entry.vote_number,
    vote_date: entry.vote_date,
    title: bill?.title ?? entry.title,
    summary,
    outcome_label: status === "passed" ? "Passed the Senate hurdle" : "Failed in the Senate",
    status,
    category,
    bill,
    tally,
    crossed_party_lines: crossovers,
    source_coverage: buildCoverage(bill),
    detail_path: `/votes/${ledger.congress}/${ledger.session}/${entry.vote_number}`,
    plain_action: profile.plain_action,
    public_impact_summary: profile.public_impact_summary,
    content_confidence: profile.content_confidence,
    source_basis: profile.source_basis,
  };
}

function buildArgumentExcerpts(bill: BillRef | undefined): ArgumentExcerpt[] {
  const excerpts: ArgumentExcerpt[] = [];
  const seen = new Set<string>();

  for (const claim of bill?.analysis?.claims ?? []) {
    for (const [index, ref] of (claim.evidence_refs ?? []).entries()) {
      const quote = ref.quote?.trim();
      if (!quote || seen.has(quote)) continue;
      seen.add(quote);
      excerpts.push({
        id: `claim-${excerpts.length + 1}`,
        source_type: ref.source_endpoint === "summary" ? "official_summary" : "bill_analysis",
        source_label: `Official ${ref.source_endpoint}`,
        source_url: bill?.url,
        quote,
        note: claim.text,
      });
      if (index >= 1) break;
    }
    if (excerpts.length >= 6) break;
  }

  return excerpts;
}

function deriveVoteBasedPartySummary(
  breakdown: VotePartyBreakdown,
  status: VoteStatus
): PartyArgumentSummary {
  const total = breakdown.yea + breakdown.nay + breakdown.present + breakdown.not_voting;
  const voted = breakdown.yea + breakdown.nay;
  let stance: PartyPositionAnalysis["stance"] = "mixed";
  if (voted > 0) {
    const yeaShare = breakdown.yea / voted;
    if (yeaShare >= 0.7) stance = status === "passed" ? "support" : "oppose";
    else if (yeaShare <= 0.3) stance = status === "passed" ? "oppose" : "support";
  }
  const action = stance === "support" ? "mostly supported" : stance === "oppose" ? "mostly opposed" : "split";
  return {
    party: breakdown.party,
    stance,
    summary: voted === 0
      ? `${breakdown.party} had no recorded yea/nay votes in the current tally.`
      : `${breakdown.party} ${action} this vote based on the recorded yea/nay split.`,
    confidence: total >= 10 ? "high" : "medium",
    evidence_points: [`${breakdown.yea} voted Yea, ${breakdown.nay} voted Nay`],
    excerpt_ids: [],
    coverage_note: "Derived from the recorded yea/nay tally.",
  };
}

function buildArguments(
  bill: BillRef | undefined,
  partyBreakdown: VotePartyBreakdown[],
  status: VoteStatus
): VoteDetailResponse["arguments"] {
  const excerpts = buildArgumentExcerpts(bill);
  const analysisPositions = bill?.analysis?.party_positions ?? [];
  const parties: PartyArgumentSummary[] = [];

  for (const breakdown of partyBreakdown) {
    const analysisPosition = analysisPositions.find((position) => position.party === breakdown.party);
    if (analysisPosition) {
      parties.push({
        party: analysisPosition.party,
        stance: analysisPosition.stance,
        summary:
          analysisPosition.inferred_rationale[0] ??
          analysisPosition.evidence_points[0] ??
          `${analysisPosition.party} position summarized from linked official evidence.`,
        confidence: analysisPosition.confidence,
        evidence_points: analysisPosition.evidence_points,
        excerpt_ids: excerpts.slice(0, 2).map((excerpt) => excerpt.id),
        coverage_note: excerpts.length > 0 ? undefined : "Party summary is grounded in bill analysis without linked excerpts.",
      });
      continue;
    }
    parties.push(deriveVoteBasedPartySummary(breakdown, status));
  }

  return {
    available: parties.length > 0,
    coverage_note:
      excerpts.length > 0
        ? "Argument summaries are paired with available bill-analysis excerpts."
        : "Argument summaries use bill analysis or tally-derived party positions.",
    parties,
    excerpts,
  };
}

function detectStepType(entry: VoteLedgerEntry): string {
  const procedure = describeProcedure(entry);
  if (procedure) return procedure.kind;
  const q = `${entry.question} ${entry.title}`.toLowerCase();
  if (q.includes("cloture")) return "cloture";
  if (q.includes("proceed")) return "motion_to_proceed";
  if (q.includes("confirmation") || q.includes("nomination")) return "confirmation";
  if (q.includes("passage")) return "passage";
  return "vote";
}

/** All ledger votes as feed items, newest vote date first (tie-break: higher roll call number first). */
export function buildBriefingFeedItemsSortedByDate(
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexJson | null
): { sorted: BriefingFeedItem[]; billLookup: Map<number, BillRef> } {
  const billLookup = buildBillLookup(activities);
  const sorted = ledger.entries
    .map((entry) => buildFeedItem(ledger, overview, entry, billLookup))
    .sort((a, b) => b.vote_date.localeCompare(a.vote_date) || b.vote_number - a.vote_number);
  return { sorted, billLookup };
}

export function buildBriefingFeedResponse(
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexJson | null,
  source: BriefingFeedResponse["source"] = "d1"
): BriefingFeedResponse {
  const { sorted } = buildBriefingFeedItemsSortedByDate(ledger, overview, activities);
  const items = sorted.slice(0, BRIEFING_FEED_ITEM_LIMIT);

  return {
    generated_at: new Date().toISOString(),
    source,
    items,
    coverage_note: items.some((item) => item.source_coverage.level !== "full")
      ? "Some votes currently have full vote data but partial contextual or excerpt coverage."
      : undefined,
  };
}

export function buildVoteDetailResponse(
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexJson | null,
  voteNumber: number,
  source: VoteDetailResponse["source"] = "d1"
): VoteDetailResponse | null {
  const entry = ledger.entries.find((candidate) => candidate.vote_number === voteNumber);
  if (!entry) return null;

  const billLookup = buildBillLookup(activities);
  const bill = billLookup.get(entry.vote_number);
  const tally = computeTallies(entry, overview);
  const crossovers = computeCrossovers(entry, overview);
  const partyBreakdown = computePartyBreakdown(entry, overview);
  const feedItem = buildFeedItem(ledger, overview, entry, billLookup);
  const voteContentProfile = buildVoteContentContext(ledger, entry, bill, describeProcedure(entry));
  const threadKey = buildThreadKey(entry, bill);
  const issueKey = buildIssueKey(entry, bill);
  const issueTitle = buildIssueTitle(entry, bill);
  const threadVotes = ledger.entries
    .filter((candidate) => buildThreadKey(candidate, billLookup.get(candidate.vote_number)) === threadKey)
    .sort((a, b) => a.vote_date.localeCompare(b.vote_date) || a.vote_number - b.vote_number);
  const issueVotes = ledger.entries
    .filter((candidate) => buildIssueKey(candidate, billLookup.get(candidate.vote_number)) === issueKey)
    .sort((a, b) => a.vote_date.localeCompare(b.vote_date) || a.vote_number - b.vote_number);
  const currentIndex = issueVotes.findIndex((candidate) => candidate.vote_number === voteNumber);
  const relatedVotes = issueVotes
    .filter((candidate) => candidate.vote_number !== voteNumber)
    .slice(-5)
    .reverse()
    .map((candidate) => ({
      congress: ledger.congress,
      session: ledger.session,
      vote_number: candidate.vote_number,
      vote_date: candidate.vote_date,
      title: candidate.title,
      result: candidate.result,
    }));
  const lastComparableVote = currentIndex > 0
    ? {
        congress: ledger.congress,
        session: ledger.session,
        vote_number: issueVotes[currentIndex - 1].vote_number,
        vote_date: issueVotes[currentIndex - 1].vote_date,
        title: issueVotes[currentIndex - 1].title,
        result: issueVotes[currentIndex - 1].result,
      }
    : undefined;

  return {
    generated_at: new Date().toISOString(),
    source,
    vote_content_profile: voteContentProfile,
    vote: {
      id: feedItem.id,
      congress: ledger.congress,
      session: ledger.session,
      vote_number: entry.vote_number,
      vote_date: entry.vote_date,
      title: bill?.title ?? entry.title,
      question: entry.question,
      result: entry.result,
      issue: entry.issue,
      bill,
      tally,
      status: feedItem.status,
    },
    procedural_context: {
      step_type: detectStepType(entry),
      question: entry.question,
    },
    party_breakdown: partyBreakdown,
    crossovers,
    history: {
      thread_key: threadKey,
      measure_recurrence_count: threadVotes.length,
      issue_key: issueKey,
      issue_title: issueTitle,
      issue_recurrence_count: issueVotes.length,
      first_seen_vote_date: issueVotes[0]?.vote_date,
      last_comparable_vote: lastComparableVote,
      related_votes: relatedVotes,
    },
    arguments: buildArguments(bill, partyBreakdown, feedItem.status),
    source_coverage: buildCoverage(bill),
  };
}

export function buildPipelineMaterialization(
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexJson | null
): PipelineMaterialization {
  const briefing = buildBriefingFeedResponse(ledger, overview, activities, "d1");
  const voteDetails = ledger.entries
    .map((entry) => buildVoteDetailResponse(ledger, overview, activities, entry.vote_number, "d1"))
    .filter((item): item is VoteDetailResponse => Boolean(item));

  return { briefing, voteDetails };
}

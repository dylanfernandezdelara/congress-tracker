import { buildBillKey } from "../congress";
import type { ActivityIndexJson, BillRef, SessionOverview, VoteLedger } from "../types";
import type {
  BriefingFeedResponse,
  HistoricalVoteReference,
  PipelineMaterialization,
  VoteDetailResponse,
} from "../platform-types";
import { buildIssueKey, buildThreadKey } from "../domain/issue-keys";
import { normalizeHistoricalBillType } from "../domain/bill-ref";
import { normalizeVoteStatus } from "../domain/vote-status";
import { buildVoteDetailResponse } from "../read-model";
import type { VoteDetails } from "../xml";
import { ensurePlatformSchema } from "./schema";
import {
  buildImportanceReasonsJson,
  significanceToScore,
} from "../domain/significance-score";
import type { SignificanceLevel } from "../platform-types";

function toSqlBool(value: boolean): number {
  return value ? 1 : 0;
}

function canBuildBillKey(bill: BillRef | undefined): bill is BillRef {
  return Boolean(
    bill &&
      typeof bill.congress === "number" &&
      typeof bill.type === "string" &&
      bill.type.trim() &&
      typeof bill.number === "string" &&
      bill.number.trim()
  );
}

function extractHistoricalThreadKey(detail: VoteDetails): string {
  const text = `${detail.vote_document ?? ""} ${detail.vote_title} ${detail.vote_question}`;
  const match = text.match(
    /\b(S\.?J\.?RES\.?|S\.?CON\.?RES\.?|S\.?RES\.?|S\.?|H\.?J\.?RES\.?|H\.?CON\.?RES\.?|H\.?RES\.?|H\.?R\.?)\s*\.?\s*(\d+)\b/i
  );
  if (match) {
    return `${detail.congress}:${normalizeHistoricalBillType(match[1])}:${match[2]}`;
  }
  const issue = detail.vote_document?.trim();
  if (issue) return issue.toUpperCase();
  return `vote:${detail.congress}:${detail.session}:${detail.vote_number}`;
}

function extractHistoricalIssueKey(detail: VoteDetails): string {
  const threadKey = extractHistoricalThreadKey(detail);
  const entryLike = {
    vote_number: detail.vote_number,
    vote_date: detail.vote_date,
    title: detail.vote_title,
    question: detail.vote_question,
    result: detail.vote_result,
    issue: detail.vote_document ?? undefined,
    member_votes: {},
  };
  return buildIssueKey(entryLike, undefined) || threadKey;
}

function isEarlierVote(
  candidate: HistoricalVoteReference,
  current: HistoricalVoteReference
): boolean {
  if (candidate.vote_date !== current.vote_date) {
    return candidate.vote_date < current.vote_date;
  }
  if (candidate.congress !== current.congress) {
    return candidate.congress < current.congress;
  }
  if (candidate.session !== current.session) {
    return candidate.session < current.session;
  }
  return candidate.vote_number < current.vote_number;
}

export async function writePlatformMaterializationToD1(
  db: D1Database,
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexJson | null,
  materialization: PipelineMaterialization
): Promise<void> {
  await ensurePlatformSchema(db);
  const now = new Date().toISOString();
  const billLookup = new Map<number, BillRef>();
  const briefingItemByVoteNumber = new Map(
    materialization.briefing.items.map((item) => [item.vote_number, item] as const)
  );
  for (const activity of activities?.activities ?? []) {
    if (activity.type !== "roll_call_vote" || !activity.bill) continue;
    const voteNumber = Number(activity.activity_id.split(":").at(-1));
    if (!Number.isNaN(voteNumber)) billLookup.set(voteNumber, activity.bill);
  }
  const senatorById = new Map(overview.senators.map((senator) => [senator.bioguide_id, senator]));

  await db.prepare("DELETE FROM vote_members WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();
  await db.prepare("DELETE FROM issue_thread_votes WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();
  await db.prepare("DELETE FROM importance_scores WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();
  await db.prepare("DELETE FROM historical_context WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();
  await db.prepare("DELETE FROM vote_read_models WHERE congress = ? AND session = ?").bind(ledger.congress, ledger.session).run();

  for (const detail of materialization.voteDetails) {
    const item = briefingItemByVoteNumber.get(detail.vote.vote_number);
    const bill = detail.vote.bill;
    const billKey = canBuildBillKey(bill) ? buildBillKey(bill) : null;
    const sourceEntry = ledger.entries.find((entry) => entry.vote_number === detail.vote.vote_number);
    if (!sourceEntry) continue;
    const threadKey = buildThreadKey(sourceEntry, bill);
    await db
      .prepare(
        `INSERT OR REPLACE INTO votes (
          congress, session, vote_number, vote_date, title, question, result, issue,
          bill_key, policy_area, thread_key, issue_key, status, significance, score, summary, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        detail.vote.congress,
        detail.vote.session,
        detail.vote.vote_number,
        detail.vote.vote_date,
        detail.vote.title,
        detail.vote.question,
        detail.vote.result,
        detail.vote.issue ?? null,
        billKey,
        bill?.policy_area ?? null,
        threadKey,
        buildIssueKey(sourceEntry, bill),
        detail.vote.status,
        item?.significance ?? bill?.analysis?.significance ?? "low",
        significanceToScore(
          (item?.significance ?? bill?.analysis?.significance ?? "low") as SignificanceLevel
        ),
        item?.summary ?? `Senate vote on ${detail.vote.title}.`,
        now
      )
      .run();

    if (item) {
      const significance = item.significance;
      await db
        .prepare(
          `INSERT OR REPLACE INTO importance_scores (
            congress, session, vote_number, score, reasons_json, generated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          item.congress,
          item.session,
          item.vote_number,
          significanceToScore(significance),
          buildImportanceReasonsJson(
            significance,
            bill?.analysis?.significance_reason
          ),
          materialization.briefing.generated_at
        )
        .run();
    }

    if (billKey && bill) {
      await db
        .prepare(
          `INSERT OR REPLACE INTO bills (
            bill_key, congress, bill_type, bill_number, title, summary, policy_area, url,
            significance, category, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          billKey,
          bill.congress,
          bill.type,
          bill.number,
          bill.title ?? null,
          bill.summary ?? null,
          bill.policy_area ?? null,
          bill.url ?? null,
          bill.analysis?.significance ?? null,
          bill.analysis?.category ?? null,
          now
        )
        .run();
    }
  }

  const threadMembers = new Map<string, { title: string; policy_area?: string; bill_key?: string; voteDates: string[]; votes: number[] }>();
  for (const entry of ledger.entries) {
    const bill = billLookup.get(entry.vote_number);
    const threadKey = buildThreadKey(entry, bill);
    const group = threadMembers.get(threadKey) ?? {
      title: bill?.title ?? entry.title,
      policy_area: bill?.policy_area ?? entry.policy_area,
      bill_key: canBuildBillKey(bill) ? buildBillKey(bill) : undefined,
      voteDates: [],
      votes: [],
    };
    group.voteDates.push(entry.vote_date);
    group.votes.push(entry.vote_number);
    threadMembers.set(threadKey, group);

    await db
      .prepare(
        "INSERT OR REPLACE INTO issue_thread_votes (thread_key, congress, session, vote_number) VALUES (?, ?, ?, ?)"
      )
      .bind(threadKey, ledger.congress, ledger.session, entry.vote_number)
      .run();

    for (const [bioguideId, voteCast] of Object.entries(entry.member_votes)) {
      const senator = senatorById.get(bioguideId);
      if (!senator) continue;
      const majorityVote = itemPartyMajority(ledger, overview, entry.vote_number).get(senator.party);
      await db
        .prepare(
          `INSERT OR REPLACE INTO vote_members (
            congress, session, vote_number, bioguide_id, name, party, state, vote_cast, against_party_majority
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          ledger.congress,
          ledger.session,
          entry.vote_number,
          bioguideId,
          senator.name,
          senator.party,
          senator.state,
          voteCast,
          toSqlBool(Boolean(majorityVote) && voteCast.toLowerCase() !== majorityVote)
        )
        .run();
    }
  }

  for (const [threadKey, group] of threadMembers.entries()) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO issue_threads (
          thread_key, display_title, policy_area, bill_key, recurrence_count, last_vote_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        threadKey,
        group.title,
        group.policy_area ?? null,
        group.bill_key ?? null,
        group.votes.length,
        [...group.voteDates].sort().at(-1) ?? now.slice(0, 10),
        now
      )
      .run();
  }

  await db
    .prepare(
      `DELETE FROM issue_threads
      WHERE thread_key NOT IN (SELECT DISTINCT thread_key FROM issue_thread_votes)`
    )
    .run();

  for (const detail of materialization.voteDetails) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO vote_read_models (
          detail_key, congress, session, vote_number, generated_at, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        detail.vote.id,
        detail.vote.congress,
        detail.vote.session,
        detail.vote.vote_number,
        detail.generated_at,
        JSON.stringify(detail)
      )
      .run();

    await db
      .prepare(
        `INSERT OR REPLACE INTO historical_context (
          congress, session, vote_number, thread_key, recurrence_count, last_comparable_vote_json, related_votes_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        detail.vote.congress,
        detail.vote.session,
        detail.vote.vote_number,
        detail.history.thread_key,
        detail.history.measure_recurrence_count,
        detail.history.last_comparable_vote ? JSON.stringify(detail.history.last_comparable_vote) : null,
        JSON.stringify(detail.history.related_votes),
        now
      )
      .run();

  }

  await db
    .prepare("INSERT OR REPLACE INTO daily_briefings (briefing_key, generated_at, payload_json) VALUES (?, ?, ?)")
    .bind("latest", materialization.briefing.generated_at, JSON.stringify(materialization.briefing))
    .run();
}

function itemPartyMajority(ledger: VoteLedger, overview: SessionOverview, voteNumber: number): Map<string, string> {
  const detail = buildVoteDetailResponse(ledger, overview, null, voteNumber);
  const map = new Map<string, string>();
  for (const party of detail?.party_breakdown ?? []) {
    if (party.majority_vote) map.set(party.party, party.majority_vote);
  }
  return map;
}

export async function writeHistoricalVoteBatchToD1(
  db: D1Database,
  details: VoteDetails[]
): Promise<void> {
  if (details.length === 0) return;
  await ensurePlatformSchema(db);
  const now = new Date().toISOString();
  const touchedThreads = new Set<string>();

  for (const detail of details) {
    const threadKey = extractHistoricalThreadKey(detail);
    const issueKey = extractHistoricalIssueKey(detail);
    touchedThreads.add(threadKey);

    await db
      .prepare(
        `INSERT OR IGNORE INTO votes (
          congress, session, vote_number, vote_date, title, question, result, issue,
          bill_key, policy_area, thread_key, issue_key, status, significance, score, summary, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        detail.congress,
        detail.session,
        detail.vote_number,
        detail.vote_date,
        detail.vote_title,
        detail.vote_question,
        detail.vote_result,
        detail.vote_document ?? null,
        null,
        null,
        threadKey,
        issueKey,
        normalizeVoteStatus(detail.vote_result),
        "low",
        significanceToScore("low"),
        `Historical Senate vote on ${detail.vote_title}.`,
        now
      )
      .run();

    await db
      .prepare(
        `INSERT OR IGNORE INTO issue_thread_votes (
          thread_key, congress, session, vote_number
        ) VALUES (?, ?, ?, ?)`
      )
      .bind(threadKey, detail.congress, detail.session, detail.vote_number)
      .run();
  }

  for (const threadKey of touchedThreads) {
    const latestResult = await db
      .prepare(
        `SELECT title, policy_area, bill_key, vote_date
        FROM votes
        WHERE thread_key = ?
        ORDER BY vote_date DESC, congress DESC, session DESC, vote_number DESC
        LIMIT 1`
      )
      .bind(threadKey)
      .all<Record<string, unknown>>();
    const countResult = await db
      .prepare("SELECT COUNT(*) AS total FROM votes WHERE thread_key = ?")
      .bind(threadKey)
      .all<Record<string, unknown>>();
    const latestRow = latestResult.results?.[0];
    const total = Number(countResult.results?.[0]?.total ?? 0);
    if (!latestRow || total <= 0) continue;

    await db
      .prepare(
        `INSERT OR REPLACE INTO issue_threads (
          thread_key, display_title, policy_area, bill_key, recurrence_count, last_vote_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        threadKey,
        String(latestRow.title),
        latestRow.policy_area ? String(latestRow.policy_area) : null,
        latestRow.bill_key ? String(latestRow.bill_key) : null,
        total,
        String(latestRow.vote_date),
        now
      )
      .run();
  }
}

async function readHistoricalContextForVote(
  db: D1Database,
  detail: VoteDetailResponse
): Promise<VoteDetailResponse["history"]> {
  const issueKey = detail.history.issue_key || detail.history.thread_key;
  const currentRef: HistoricalVoteReference = {
    congress: detail.vote.congress,
    session: detail.vote.session,
    vote_number: detail.vote.vote_number,
    vote_date: detail.vote.vote_date,
    title: detail.vote.title,
    result: detail.vote.result,
  };
  const [threadCountResult, issueCountResult, firstSeenResult, votesResult] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS total FROM votes WHERE thread_key = ?")
      .bind(detail.history.thread_key)
      .all<Record<string, unknown>>(),
    db
      .prepare("SELECT COUNT(*) AS total FROM votes WHERE COALESCE(issue_key, thread_key) = ?")
      .bind(issueKey)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT vote_date
        FROM votes
        WHERE COALESCE(issue_key, thread_key) = ?
        ORDER BY vote_date ASC, congress ASC, session ASC, vote_number ASC
        LIMIT 1`
      )
      .bind(issueKey)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT congress, session, vote_number, vote_date, title, result
        FROM votes
        WHERE COALESCE(issue_key, thread_key) = ?
        ORDER BY vote_date DESC, congress DESC, session DESC, vote_number DESC
        LIMIT 12`
      )
      .bind(issueKey)
      .all<Record<string, unknown>>(),
  ]);

  const references: HistoricalVoteReference[] = (votesResult.results ?? []).map((row) => ({
    congress: Number(row.congress),
    session: Number(row.session),
    vote_number: Number(row.vote_number),
    vote_date: String(row.vote_date),
    title: String(row.title),
    result: String(row.result),
  }));
  const relatedVotes = references
    .filter((reference) => !(reference.congress === currentRef.congress && reference.session === currentRef.session && reference.vote_number === currentRef.vote_number))
    .slice(0, 5);
  const lastComparableVote = references.find((reference) => isEarlierVote(reference, currentRef));

  return {
    thread_key: detail.history.thread_key,
    measure_recurrence_count: Number(
      threadCountResult.results?.[0]?.total ?? detail.history.measure_recurrence_count
    ),
    issue_key: issueKey,
    issue_title: detail.history.issue_title,
    issue_recurrence_count: Number(
      issueCountResult.results?.[0]?.total ?? detail.history.issue_recurrence_count
    ),
    first_seen_vote_date:
      (firstSeenResult.results?.[0]?.vote_date ? String(firstSeenResult.results[0].vote_date) : undefined) ??
      detail.history.first_seen_vote_date,
    last_comparable_vote: lastComparableVote ?? detail.history.last_comparable_vote,
    related_votes: relatedVotes.length > 0 ? relatedVotes : detail.history.related_votes,
  };
}

async function readJsonPayload<T>(result: D1Result<Record<string, unknown>>): Promise<T | null> {
  const row = result.results?.[0] as { payload_json?: string } | undefined;
  if (!row?.payload_json) return null;
  return JSON.parse(row.payload_json) as T;
}

export async function readLatestBriefingFromD1(db: D1Database): Promise<BriefingFeedResponse | null> {
  const result = await db
    .prepare("SELECT payload_json FROM daily_briefings WHERE briefing_key = ? LIMIT 1")
    .bind("latest")
    .all<Record<string, unknown>>();
  const payload = await readJsonPayload<BriefingFeedResponse>(result);
  if (!payload) return null;
  // The materialized payload (built by buildBriefingFeedResponse) already carries
  // each item's source_coverage and the aggregate coverage_note, so it is the
  // single source of truth on read.
  return { ...payload, source: "d1" };
}

export async function readVoteDetailFromD1(
  db: D1Database,
  congress: number,
  session: number,
  voteNumber: number
): Promise<VoteDetailResponse | null> {
  const result = await db
    .prepare(
      "SELECT payload_json FROM vote_read_models WHERE congress = ? AND session = ? AND vote_number = ? LIMIT 1"
    )
    .bind(congress, session, voteNumber)
    .all<Record<string, unknown>>();
  const payload = await readJsonPayload<VoteDetailResponse>(result);
  if (!payload) return null;
  // arguments and source_coverage come straight from the materialized payload.
  // Only history is recomputed, since it aggregates cross-session votes that
  // historical backfill populates in the `votes` table after materialization.
  const history = await readHistoricalContextForVote(db, payload);
  return { ...payload, source: "d1", history };
}

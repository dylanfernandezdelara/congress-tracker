import { COMPANION_VOTES_PER_BILL } from "../constants";
import type { Chamber, NonPassageVoteStub, PassageVote } from "../types";
import { voteKey } from "../vote-key";
import { buildFeedFilterClause } from "./feed-search";
import { ensureSchema } from "./schema";
import { normalizeBillType } from "../sources/bill-type";

export interface ExistingVoteKeyRow {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
}

function toVoteKeys(rows: ExistingVoteKeyRow[] | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const row of rows ?? []) {
    keys.add(
      voteKey({
        chamber: row.chamber as PassageVote["chamber"],
        congress: row.congress,
        session: row.session,
        rollNumber: row.roll_number,
      })
    );
  }
  return keys;
}

/**
 * Keys for every roll already fully persisted in the lookback window, so House
 * detail fetches are not repeated daily.
 *
 * Non-passage stubs written before companion-vote support carry an empty
 * question and a 0-0 tally. They are deliberately treated as not-yet-known so
 * one later run refills them instead of caching the gap forever.
 */
export async function selectExistingVoteKeys(
  db: D1Database,
  lookbackDate: string,
  congress: number
): Promise<Set<string>> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT chamber, congress, session, roll_number
       FROM votes
       WHERE vote_date >= ? AND congress = ?
         AND (is_passage = 1 OR TRIM(question) <> '')`
    )
    .bind(lookbackDate, congress)
    .all<ExistingVoteKeyRow>();

  return toVoteKeys(results);
}

/** Session-wide equivalent of {@link selectExistingVoteKeys}, same stub rule. */
export async function selectExistingVoteKeysForSession(
  db: D1Database,
  congress: number,
  session: number
): Promise<Set<string>> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT chamber, congress, session, roll_number
       FROM votes
       WHERE congress = ? AND session = ?
         AND (is_passage = 1 OR TRIM(question) <> '')`
    )
    .bind(congress, session)
    .all<ExistingVoteKeyRow>();

  return toVoteKeys(results);
}

export async function upsertVote(db: D1Database, vote: PassageVote): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO votes (
        chamber, congress, session, roll_number,
        bill_congress, bill_type, bill_number,
        question, result, yeas, nays, vote_date, is_passage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(chamber, congress, session, roll_number) DO UPDATE SET
        bill_congress = excluded.bill_congress,
        bill_type = excluded.bill_type,
        bill_number = excluded.bill_number,
        question = excluded.question,
        result = excluded.result,
        yeas = excluded.yeas,
        nays = excluded.nays,
        vote_date = excluded.vote_date,
        is_passage = 1`
    )
    .bind(
      vote.chamber,
      vote.congress,
      vote.session,
      vote.rollNumber,
      vote.bill.congress,
      normalizeBillType(vote.bill.type),
      vote.bill.number,
      vote.question,
      vote.result,
      vote.yeas,
      vote.nays,
      vote.voteDate
    )
    .run();
}

/**
 * Record a non-passage companion roll (rule, motion to recommit, amendment).
 * The conflict update is guarded on `is_passage = 0` so an existing passage row
 * is never downgraded, while a previously blank stub can still be filled in.
 */
export async function upsertNonPassageVoteStub(
  db: D1Database,
  stub: NonPassageVoteStub
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO votes (
        chamber, congress, session, roll_number,
        bill_congress, bill_type, bill_number,
        question, result, yeas, nays, vote_date, is_passage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(chamber, congress, session, roll_number) DO UPDATE SET
        bill_congress = excluded.bill_congress,
        bill_type = excluded.bill_type,
        bill_number = excluded.bill_number,
        question = excluded.question,
        result = excluded.result,
        yeas = excluded.yeas,
        nays = excluded.nays,
        vote_date = excluded.vote_date
      WHERE votes.is_passage = 0`
    )
    .bind(
      stub.chamber,
      stub.congress,
      stub.session,
      stub.rollNumber,
      stub.bill.congress,
      normalizeBillType(stub.bill.type),
      stub.bill.number,
      stub.question,
      stub.result,
      stub.yeas,
      stub.nays,
      stub.voteDate
    )
    .run();
}

export interface BillVoteKey {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
  latest_passage_date: string;
}

/** Feed bill row: passage date is vote-only; activity drives sort order. */
export interface FeedBillRow {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
  /** MAX of passage-vote dates only; null when the bill is executive-only. */
  latest_passage_date: string | null;
  /** MAX of passage + executive sort dates (feed ordering). */
  latest_activity_date: string;
}

export async function selectRecentVotedBills(
  db: D1Database,
  lookbackDate: string,
  limit: number,
  offset = 0
): Promise<BillVoteKey[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT bill_congress, bill_type, bill_number, MAX(vote_date) AS latest_passage_date
       FROM votes
       WHERE is_passage = 1 AND vote_date >= ?
       GROUP BY bill_congress, bill_type, bill_number
       ORDER BY latest_passage_date DESC
       LIMIT ? OFFSET ?`
    )
    .bind(lookbackDate, limit, offset)
    .all<BillVoteKey>();
  return results ?? [];
}

export async function selectFeedBills(
  db: D1Database,
  voteLookbackDate: string,
  executiveSinceIso: string,
  limit: number,
  offset = 0,
  chamber?: Chamber,
  q?: string
): Promise<FeedBillRow[]> {
  await ensureSchema(db);
  const filter = buildFeedFilterClause({ chamber, q });
  const binds: Array<string | number> = [
    voteLookbackDate,
    executiveSinceIso,
    ...filter.binds,
    limit,
    offset,
  ];

  const { results } = await db
    .prepare(
      `WITH combined AS (
         SELECT bill_congress, UPPER(bill_type) AS bill_type, bill_number, MAX(vote_date) AS sort_date, 0 AS executive_boost
         FROM votes
         WHERE is_passage = 1 AND vote_date >= ?
         GROUP BY bill_congress, UPPER(bill_type), bill_number
         UNION ALL
         SELECT b.bill_congress, UPPER(b.bill_type) AS bill_type, b.bill_number, MAX(p.posted_at) AS sort_date, 1 AS executive_boost
         FROM executive_post_bills b
         JOIN executive_posts p ON p.id = b.post_id
         WHERE p.posted_at >= ?
         GROUP BY b.bill_congress, UPPER(b.bill_type), b.bill_number
       )
       SELECT bill_congress, bill_type, bill_number,
              MAX(CASE WHEN executive_boost = 0 THEN sort_date END) AS latest_passage_date,
              MAX(sort_date) AS latest_activity_date
       FROM combined
       ${filter.sql}
       GROUP BY bill_congress, bill_type, bill_number
       ORDER BY latest_activity_date DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...binds)
    .all<FeedBillRow>();
  return results ?? [];
}

export async function countFeedBills(
  db: D1Database,
  voteLookbackDate: string,
  executiveSinceIso: string,
  chamber?: Chamber,
  q?: string
): Promise<number> {
  await ensureSchema(db);
  const filter = buildFeedFilterClause({ chamber, q });
  const binds: Array<string | number> = [
    voteLookbackDate,
    executiveSinceIso,
    ...filter.binds,
  ];

  const row = await db
    .prepare(
      `WITH combined AS (
         SELECT bill_congress, UPPER(bill_type) AS bill_type, bill_number
         FROM votes
         WHERE is_passage = 1 AND vote_date >= ?
         GROUP BY bill_congress, UPPER(bill_type), bill_number
         UNION
         SELECT b.bill_congress, UPPER(b.bill_type) AS bill_type, b.bill_number
         FROM executive_post_bills b
         JOIN executive_posts p ON p.id = b.post_id
         WHERE p.posted_at >= ?
         GROUP BY b.bill_congress, UPPER(b.bill_type), b.bill_number
       )
       SELECT COUNT(*) AS total FROM combined
       ${filter.sql}`
    )
    .bind(...binds)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export interface VoteRow {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  question: string;
  result: string;
  yeas: number;
  nays: number;
  vote_date: string;
}

/** Bill + tally metadata for one passage roll call. */
export interface VoteRollMeta {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  bill_type: string;
  bill_number: number;
  bill_congress: number;
  yeas: number;
  nays: number;
  vote_date: string;
}

export async function getVoteRollMeta(
  db: D1Database,
  roll: {
    chamber: string;
    congress: number;
    session: number;
    roll_number: number;
  }
): Promise<VoteRollMeta | null> {
  await ensureSchema(db);
  return db
    .prepare(
      `SELECT chamber, congress, session, roll_number,
              bill_type, bill_number, bill_congress, yeas, nays, vote_date
       FROM votes
       WHERE chamber = ? AND congress = ? AND session = ? AND roll_number = ?
         AND is_passage = 1`
    )
    .bind(roll.chamber, roll.congress, roll.session, roll.roll_number)
    .first<VoteRollMeta>();
}

export async function getPassageVotesForBill(
  db: D1Database,
  congress: number,
  billType: string,
  billNumber: number
): Promise<VoteRow[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT chamber, congress, session, roll_number, question, result, yeas, nays, vote_date
       FROM votes
       WHERE bill_congress = ? AND UPPER(bill_type) = ? AND bill_number = ? AND is_passage = 1
       ORDER BY vote_date DESC`
    )
    .bind(congress, normalizeBillType(billType), billNumber)
    .all<VoteRow>();
  return results ?? [];
}

export type BillLookupKey = {
  congress: number;
  billType: string;
  billNumber: number;
};

export function billLookupKey(
  congress: number,
  billType: string,
  billNumber: number
): string {
  return `${congress}:${normalizeBillType(billType)}:${billNumber}`;
}

/** D1 caps bound parameters; each bill uses 3 binds in the OR tuple query. */
const BILL_LOOKUP_CHUNK = 30;

type VoteRowWithBill = VoteRow & {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
};

/** Passage votes for many bills in a constant number of chunked queries. */
export async function getPassageVotesForBills(
  db: D1Database,
  bills: BillLookupKey[]
): Promise<Map<string, VoteRow[]>> {
  await ensureSchema(db);
  const map = new Map<string, VoteRow[]>();
  if (bills.length === 0) return map;

  const unique = new Map<string, BillLookupKey>();
  for (const bill of bills) {
    const key = billLookupKey(bill.congress, bill.billType, bill.billNumber);
    unique.set(key, {
      congress: bill.congress,
      billType: normalizeBillType(bill.billType),
      billNumber: bill.billNumber,
    });
    map.set(key, []);
  }
  const list = [...unique.values()];

  for (let i = 0; i < list.length; i += BILL_LOOKUP_CHUNK) {
    const chunk = list.slice(i, i + BILL_LOOKUP_CHUNK);
    const clauses = chunk
      .map(() => "(bill_congress = ? AND UPPER(bill_type) = ? AND bill_number = ?)")
      .join(" OR ");
    const binds: Array<string | number> = [];
    for (const bill of chunk) {
      binds.push(bill.congress, bill.billType, bill.billNumber);
    }
    const { results } = await db
      .prepare(
        `SELECT chamber, congress, session, roll_number, question, result, yeas, nays, vote_date,
                bill_congress, bill_type, bill_number
         FROM votes
         WHERE is_passage = 1 AND (${clauses})
         ORDER BY vote_date DESC`
      )
      .bind(...binds)
      .all<VoteRowWithBill>();

    for (const row of results ?? []) {
      const key = billLookupKey(row.bill_congress, row.bill_type, row.bill_number);
      const listForBill = map.get(key) ?? [];
      listForBill.push({
        chamber: row.chamber,
        congress: row.congress,
        session: row.session,
        roll_number: row.roll_number,
        question: row.question,
        result: row.result,
        yeas: row.yeas,
        nays: row.nays,
        vote_date: row.vote_date,
      });
      map.set(key, listForBill);
    }
  }
  return map;
}

/**
 * Non-passage companion rolls (rules, motions to recommit, amendment votes) for
 * many bills. Rolls with no recorded question or tally are excluded: those are
 * legacy negative-cache stubs with nothing to show a reader.
 */
export async function getCompanionVotesForBills(
  db: D1Database,
  bills: BillLookupKey[]
): Promise<Map<string, VoteRow[]>> {
  await ensureSchema(db);
  const map = new Map<string, VoteRow[]>();
  if (bills.length === 0) return map;

  const unique = new Map<string, BillLookupKey>();
  for (const bill of bills) {
    const key = billLookupKey(bill.congress, bill.billType, bill.billNumber);
    unique.set(key, {
      congress: bill.congress,
      billType: normalizeBillType(bill.billType),
      billNumber: bill.billNumber,
    });
    map.set(key, []);
  }
  const list = [...unique.values()];

  for (let i = 0; i < list.length; i += BILL_LOOKUP_CHUNK) {
    const chunk = list.slice(i, i + BILL_LOOKUP_CHUNK);
    const clauses = chunk
      .map(() => "(bill_congress = ? AND UPPER(bill_type) = ? AND bill_number = ?)")
      .join(" OR ");
    const binds: Array<string | number> = [];
    for (const bill of chunk) {
      binds.push(bill.congress, bill.billType, bill.billNumber);
    }
    const { results } = await db
      .prepare(
        `SELECT chamber, congress, session, roll_number, question, result, yeas, nays, vote_date,
                bill_congress, bill_type, bill_number
         FROM votes
         WHERE is_passage = 0 AND TRIM(question) <> '' AND (yeas + nays) > 0
           AND (${clauses})
         ORDER BY vote_date DESC, roll_number DESC`
      )
      .bind(...binds)
      .all<VoteRowWithBill>();

    for (const row of results ?? []) {
      const key = billLookupKey(row.bill_congress, row.bill_type, row.bill_number);
      const listForBill = map.get(key) ?? [];
      // A long-running bill can accumulate dozens of procedural rolls. Rows
      // arrive newest first, so keeping the first few per bill bounds the feed
      // payload without another query.
      if (listForBill.length >= COMPANION_VOTES_PER_BILL) continue;
      listForBill.push({
        chamber: row.chamber,
        congress: row.congress,
        session: row.session,
        roll_number: row.roll_number,
        question: row.question,
        result: row.result,
        yeas: row.yeas,
        nays: row.nays,
        vote_date: row.vote_date,
      });
      map.set(key, listForBill);
    }
  }
  return map;
}

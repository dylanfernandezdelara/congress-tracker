import type { PassageVote } from "../types";
import { voteKey } from "../vote-key";
import { ensureSchema } from "./schema";
import { normalizeBillType } from "../sources/bill-type";

export interface ExistingVoteKeyRow {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
}

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
       WHERE is_passage = 1 AND vote_date >= ? AND congress = ?`
    )
    .bind(lookbackDate, congress)
    .all<ExistingVoteKeyRow>();

  const keys = new Set<string>();
  for (const row of results ?? []) {
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
       WHERE is_passage = 1 AND congress = ? AND session = ?`
    )
    .bind(congress, session)
    .all<ExistingVoteKeyRow>();

  const keys = new Set<string>();
  for (const row of results ?? []) {
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
        vote_date = excluded.vote_date`
    )
    .bind(
      vote.chamber,
      vote.congress,
      vote.session,
      vote.rollNumber,
      vote.bill.congress,
      vote.bill.type,
      vote.bill.number,
      vote.question,
      vote.result,
      vote.yeas,
      vote.nays,
      vote.voteDate
    )
    .run();
}

export interface BillVoteKey {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
  latest_passage_date: string;
}

export async function countRecentVotedBills(
  db: D1Database,
  lookbackDate: string
): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM (
         SELECT 1
         FROM votes
         WHERE is_passage = 1 AND vote_date >= ?
         GROUP BY bill_congress, bill_type, bill_number
       )`
    )
    .bind(lookbackDate)
    .first<{ total: number }>();
  return row?.total ?? 0;
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
  offset = 0
): Promise<BillVoteKey[]> {
  await ensureSchema(db);
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
         WHERE p.posted_at >= ? AND b.is_primary = 1
         GROUP BY b.bill_congress, UPPER(b.bill_type), b.bill_number
       )
       SELECT bill_congress, bill_type, bill_number, MAX(sort_date) AS latest_passage_date
       FROM combined
       GROUP BY bill_congress, bill_type, bill_number
       ORDER BY MAX(executive_boost) DESC, latest_passage_date DESC
       LIMIT ? OFFSET ?`
    )
    .bind(voteLookbackDate, executiveSinceIso, limit, offset)
    .all<BillVoteKey>();
  return results ?? [];
}

export async function countFeedBills(
  db: D1Database,
  voteLookbackDate: string,
  executiveSinceIso: string
): Promise<number> {
  await ensureSchema(db);
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
         WHERE p.posted_at >= ? AND b.is_primary = 1
         GROUP BY b.bill_congress, UPPER(b.bill_type), b.bill_number
       )
       SELECT COUNT(*) AS total FROM combined`
    )
    .bind(voteLookbackDate, executiveSinceIso)
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

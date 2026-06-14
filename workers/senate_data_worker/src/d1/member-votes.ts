import type { MemberVoteRecord } from "../types";
import { ensureSchema } from "./schema";

export async function upsertMemberVote(db: D1Database, vote: MemberVoteRecord): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO member_votes (chamber, congress, session, roll_number, bioguide_id, position)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(chamber, congress, session, roll_number, bioguide_id) DO UPDATE SET
         position = excluded.position`
    )
    .bind(
      vote.chamber,
      vote.congress,
      vote.session,
      vote.rollNumber,
      vote.bioguideId,
      vote.position
    )
    .run();
}

export interface RollCallKey {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
}

export async function selectPassageRollCalls(
  db: D1Database,
  congress: number,
  session: number
): Promise<RollCallKey[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT chamber, congress, session, roll_number
       FROM votes
       WHERE congress = ? AND session = ? AND is_passage = 1
       ORDER BY chamber, roll_number`
    )
    .bind(congress, session)
    .all<RollCallKey>();
  return results ?? [];
}

export async function countMemberVotesForRoll(
  db: D1Database,
  roll: RollCallKey
): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM member_votes
       WHERE chamber = ? AND congress = ? AND session = ? AND roll_number = ?`
    )
    .bind(roll.chamber, roll.congress, roll.session, roll.roll_number)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export interface MemberVoteWithRoll {
  bioguide_id: string;
  position: string;
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  yeas: number;
  nays: number;
  bill_type: string;
  bill_number: number;
  bill_congress: number;
}

export async function selectMemberVotesForSession(
  db: D1Database,
  congress: number,
  session: number,
  chamber: string
): Promise<MemberVoteWithRoll[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT mv.bioguide_id, mv.position, mv.chamber, mv.congress, mv.session, mv.roll_number,
              v.yeas, v.nays, v.bill_type, v.bill_number, v.bill_congress
       FROM member_votes mv
       JOIN votes v
         ON v.chamber = mv.chamber AND v.congress = mv.congress
        AND v.session = mv.session AND v.roll_number = mv.roll_number
       WHERE mv.congress = ? AND mv.session = ? AND mv.chamber = ?`
    )
    .bind(congress, session, chamber)
    .all<MemberVoteWithRoll>();
  return results ?? [];
}

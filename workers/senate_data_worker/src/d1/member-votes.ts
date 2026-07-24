import type { MemberVoteRecord } from "../types";
import { deleteMemberCrossVotesForRoll } from "./member-session-stats";
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

/**
 * Upsert all member votes for a roll in a single atomic D1 batch. The batch is
 * one transaction (all-or-nothing), so a roll is never left partially written —
 * which keeps the `countMemberVotesForRoll > 0` skip check in the pipeline a
 * safe completion marker. Each statement stays within the 100-param limit.
 */
export async function upsertMemberVotesBatch(
  db: D1Database,
  votes: MemberVoteRecord[]
): Promise<void> {
  if (votes.length === 0) return;
  await ensureSchema(db);
  const stmt = db.prepare(
    `INSERT INTO member_votes (chamber, congress, session, roll_number, bioguide_id, position)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chamber, congress, session, roll_number, bioguide_id) DO UPDATE SET
       position = excluded.position`
  );
  const batch = votes.map((vote) =>
    stmt.bind(
      vote.chamber,
      vote.congress,
      vote.session,
      vote.rollNumber,
      vote.bioguideId,
      vote.position
    )
  );
  await db.batch(batch);
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

export async function countLisMemberVotesForRoll(
  db: D1Database,
  roll: RollCallKey
): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM member_votes
       WHERE chamber = ? AND congress = ? AND session = ? AND roll_number = ?
         AND bioguide_id LIKE 'LIS:%'`
    )
    .bind(roll.chamber, roll.congress, roll.session, roll.roll_number)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function deleteMemberVotesForRoll(db: D1Database, roll: RollCallKey): Promise<void> {
  await ensureSchema(db);
  // Keep denormalized cross-vote rows from pointing at a roll we are about to
  // rewrite; tallies are refreshed when the replacement votes are applied.
  await deleteMemberCrossVotesForRoll(db, roll);
  await db
    .prepare(
      `DELETE FROM member_votes
       WHERE chamber = ? AND congress = ? AND session = ? AND roll_number = ?`
    )
    .bind(roll.chamber, roll.congress, roll.session, roll.roll_number)
    .run();
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
  vote_date: string;
}

export interface MemberVotePositionRow {
  bioguide_id: string;
  position: string;
}

export async function selectMemberVotesForRoll(
  db: D1Database,
  roll: RollCallKey
): Promise<MemberVotePositionRow[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT bioguide_id, position
       FROM member_votes
       WHERE chamber = ? AND congress = ? AND session = ? AND roll_number = ?`
    )
    .bind(roll.chamber, roll.congress, roll.session, roll.roll_number)
    .all<MemberVotePositionRow>();
  return results ?? [];
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
              v.yeas, v.nays, v.bill_type, v.bill_number, v.bill_congress, v.vote_date
       FROM member_votes mv
       JOIN votes v
         ON v.chamber = mv.chamber AND v.congress = mv.congress
        AND v.session = mv.session AND v.roll_number = mv.roll_number
        AND v.is_passage = 1
       WHERE mv.congress = ? AND mv.session = ? AND mv.chamber = ?
       ORDER BY v.vote_date DESC`
    )
    .bind(congress, session, chamber)
    .all<MemberVoteWithRoll>();
  return results ?? [];
}

/** D1 caps bound parameters at 100; each roll uses 2 binds after congress/session. */
const ROLL_IDENTITY_CHUNK = 40;

export type MemberVoteWithPartyRow = {
  bioguide_id: string;
  party: string | null;
  position: string;
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
};

/**
 * Member positions (+ party) for a specific set of rolls. Prefer this over a
 * full-session scan when only candidate rolls are needed for scoring.
 */
export async function selectMemberVotesForRollKeys(
  db: D1Database,
  congress: number,
  session: number,
  rolls: Array<{ chamber: string; roll_number: number }>
): Promise<MemberVoteWithPartyRow[]> {
  await ensureSchema(db);
  if (rolls.length === 0) return [];

  const unique = new Map<string, { chamber: string; roll_number: number }>();
  for (const roll of rolls) {
    unique.set(`${roll.chamber}:${roll.roll_number}`, roll);
  }
  const list = [...unique.values()];
  const out: MemberVoteWithPartyRow[] = [];

  for (let i = 0; i < list.length; i += ROLL_IDENTITY_CHUNK) {
    const chunk = list.slice(i, i + ROLL_IDENTITY_CHUNK);
    const clauses = chunk
      .map(() => "(mv.chamber = ? AND mv.roll_number = ?)")
      .join(" OR ");
    const binds: Array<string | number> = [congress, session];
    for (const roll of chunk) {
      binds.push(roll.chamber, roll.roll_number);
    }
    const { results } = await db
      .prepare(
        `SELECT mv.chamber, mv.congress, mv.session, mv.roll_number, mv.bioguide_id,
                m.party, mv.position
         FROM member_votes mv
         JOIN members m ON m.bioguide_id = mv.bioguide_id
         WHERE mv.congress = ? AND mv.session = ?
           AND (${clauses})`
      )
      .bind(...binds)
      .all<MemberVoteWithPartyRow>();
    out.push(...(results ?? []));
  }
  return out;
}

/** Passage votes for one member in a congress/session (newest first). */
export async function selectMemberVotesForBioguide(
  db: D1Database,
  congress: number,
  session: number,
  bioguideId: string
): Promise<MemberVoteWithRoll[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT mv.bioguide_id, mv.position, mv.chamber, mv.congress, mv.session, mv.roll_number,
              v.yeas, v.nays, v.bill_type, v.bill_number, v.bill_congress, v.vote_date
       FROM member_votes mv
       JOIN votes v
         ON v.chamber = mv.chamber AND v.congress = mv.congress
        AND v.session = mv.session AND v.roll_number = mv.roll_number
        AND v.is_passage = 1
       WHERE mv.congress = ? AND mv.session = ? AND mv.bioguide_id = ?
       ORDER BY v.vote_date DESC`
    )
    .bind(congress, session, bioguideId)
    .all<MemberVoteWithRoll>();
  return results ?? [];
}

export type MemberVoteRollPosition = {
  bioguide_id: string;
  position: string;
  roll_number: number;
};

const ROLL_LOOKUP_CHUNK = 40;

/** Peer positions on specific rolls in one chamber/congress/session. */
export async function selectMemberVotesForRollNumbers(
  db: D1Database,
  chamber: string,
  congress: number,
  session: number,
  rollNumbers: number[]
): Promise<MemberVoteRollPosition[]> {
  await ensureSchema(db);
  const unique = [...new Set(rollNumbers)];
  if (unique.length === 0) return [];

  const out: MemberVoteRollPosition[] = [];
  for (let i = 0; i < unique.length; i += ROLL_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + ROLL_LOOKUP_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT bioguide_id, position, roll_number
         FROM member_votes
         WHERE chamber = ? AND congress = ? AND session = ?
           AND roll_number IN (${placeholders})`
      )
      .bind(chamber, congress, session, ...chunk)
      .all<MemberVoteRollPosition>();
    out.push(...(results ?? []));
  }
  return out;
}

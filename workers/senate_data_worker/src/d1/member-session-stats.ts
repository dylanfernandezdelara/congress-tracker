import type { MemberProfileRecentCrossVote } from "../../../../shared/stats-api-types";
import { normalizeVotePosition } from "../../../../shared/vote-positions";
import { ensureSchema } from "./schema";

export type MemberSessionStatsRow = {
  bioguide_id: string;
  congress: number;
  session: number;
  votes_cast: number;
  yea_count: number;
  nay_count: number;
  cross_vote_count: number;
  updated_at: string;
};

export type MemberCrossVoteRow = {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  bioguide_id: string;
  bill_type: string;
  bill_number: number;
  bill_congress: number;
  vote_date: string;
  position: "yea" | "nay";
  party_line: "yea" | "nay";
  margin: number;
};

const ID_LOOKUP_CHUNK = 90;

export type MemberCrossVoteListRow = {
  bioguide_id: string;
  chamber: string;
  roll_number: number;
  bill_type: string;
  bill_number: number;
  bill_congress: number;
  vote_date: string;
  margin: number;
};

/** Cross-party votes for one chamber/session (newest first). Far smaller than member_votes. */
export async function selectMemberCrossVotesForChamber(
  db: D1Database,
  congress: number,
  session: number,
  chamber: string
): Promise<MemberCrossVoteListRow[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT bioguide_id, chamber, roll_number, bill_type, bill_number, bill_congress,
              vote_date, margin
       FROM member_cross_votes
       WHERE congress = ? AND session = ? AND chamber = ?
       ORDER BY vote_date DESC, roll_number DESC`
    )
    .bind(congress, session, chamber)
    .all<MemberCrossVoteListRow>();
  return results ?? [];
}

/** Session-wide cross-vote counts keyed by bioguide_id. */
export async function selectSessionCrossVoteCounts(
  db: D1Database,
  congress: number,
  session: number
): Promise<Map<string, number>> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT bioguide_id, COUNT(*) AS count
       FROM member_cross_votes
       WHERE congress = ? AND session = ?
       GROUP BY bioguide_id`
    )
    .bind(congress, session)
    .all<{ bioguide_id: string; count: number }>();

  const counts = new Map<string, number>();
  for (const row of results ?? []) {
    counts.set(row.bioguide_id, row.count);
  }
  return counts;
}

export async function getMemberSessionStats(
  db: D1Database,
  congress: number,
  session: number,
  bioguideId: string
): Promise<MemberSessionStatsRow | null> {
  await ensureSchema(db);
  return db
    .prepare(
      `SELECT bioguide_id, congress, session, votes_cast, yea_count, nay_count,
              cross_vote_count, updated_at
       FROM member_session_stats
       WHERE bioguide_id = ? AND congress = ? AND session = ?`
    )
    .bind(bioguideId, congress, session)
    .first<MemberSessionStatsRow>();
}

export async function selectRecentMemberCrossVotes(
  db: D1Database,
  congress: number,
  session: number,
  bioguideId: string,
  limit: number
): Promise<MemberProfileRecentCrossVote[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT chamber, congress, session, roll_number, bill_type, bill_number,
              bill_congress, vote_date, position, party_line, margin
       FROM member_cross_votes
       WHERE bioguide_id = ? AND congress = ? AND session = ?
       ORDER BY vote_date DESC, roll_number DESC
       LIMIT ?`
    )
    .bind(bioguideId, congress, session, limit)
    .all<{
      chamber: string;
      congress: number;
      session: number;
      roll_number: number;
      bill_type: string;
      bill_number: number;
      bill_congress: number;
      vote_date: string;
      position: string;
      party_line: string;
      margin: number;
    }>();

  return (results ?? []).flatMap((row) => {
    const position = normalizeVotePosition(row.position);
    const partyLine = normalizeVotePosition(row.party_line);
    if (position !== "yea" && position !== "nay") return [];
    if (partyLine !== "yea" && partyLine !== "nay") return [];
    if (row.chamber !== "House" && row.chamber !== "Senate") return [];
    return [
      {
        chamber: row.chamber,
        congress: row.congress,
        session: row.session,
        roll_number: row.roll_number,
        bill_type: row.bill_type,
        bill_number: row.bill_number,
        bill_congress: row.bill_congress,
        vote_date: row.vote_date,
        position,
        party_line: partyLine,
        margin: row.margin,
      } satisfies MemberProfileRecentCrossVote,
    ];
  });
}

export async function deleteMemberCrossVotesForRoll(
  db: D1Database,
  roll: {
    chamber: string;
    congress: number;
    session: number;
    roll_number: number;
  }
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `DELETE FROM member_cross_votes
       WHERE chamber = ? AND congress = ? AND session = ? AND roll_number = ?`
    )
    .bind(roll.chamber, roll.congress, roll.session, roll.roll_number)
    .run();
}

export async function replaceMemberCrossVotesForRoll(
  db: D1Database,
  roll: {
    chamber: string;
    congress: number;
    session: number;
    roll_number: number;
  },
  rows: MemberCrossVoteRow[]
): Promise<void> {
  await ensureSchema(db);
  await deleteMemberCrossVotesForRoll(db, roll);
  if (rows.length === 0) return;

  const stmt = db.prepare(
    `INSERT INTO member_cross_votes (
       chamber, congress, session, roll_number, bioguide_id,
       bill_type, bill_number, bill_congress, vote_date,
       position, party_line, margin
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const batch = rows.map((row) =>
    stmt.bind(
      row.chamber,
      row.congress,
      row.session,
      row.roll_number,
      row.bioguide_id,
      row.bill_type,
      row.bill_number,
      row.bill_congress,
      row.vote_date,
      row.position,
      row.party_line,
      row.margin
    )
  );
  await db.batch(batch);
}

export async function clearMemberSessionStatsForSession(
  db: D1Database,
  congress: number,
  session: number
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(`DELETE FROM member_cross_votes WHERE congress = ? AND session = ?`)
    .bind(congress, session)
    .run();
  await db
    .prepare(`DELETE FROM member_session_stats WHERE congress = ? AND session = ?`)
    .bind(congress, session)
    .run();
}

export async function countMemberVotesInSession(
  db: D1Database,
  congress: number,
  session: number
): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM member_votes
       WHERE congress = ? AND session = ?`
    )
    .bind(congress, session)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function sumMemberSessionVotesCast(
  db: D1Database,
  congress: number,
  session: number
): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(votes_cast), 0) AS total
       FROM member_session_stats
       WHERE congress = ? AND session = ?`
    )
    .bind(congress, session)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

type PositionTally = { votes_cast: number; yea_count: number; nay_count: number };

async function tallyPositionsForBioguides(
  db: D1Database,
  congress: number,
  session: number,
  bioguideIds: string[]
): Promise<Map<string, PositionTally>> {
  const tallies = new Map<string, PositionTally>();
  for (const id of bioguideIds) {
    tallies.set(id, { votes_cast: 0, yea_count: 0, nay_count: 0 });
  }
  if (bioguideIds.length === 0) return tallies;

  for (let i = 0; i < bioguideIds.length; i += ID_LOOKUP_CHUNK) {
    const chunk = bioguideIds.slice(i, i + ID_LOOKUP_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT bioguide_id, position
         FROM member_votes
         WHERE congress = ? AND session = ?
           AND bioguide_id IN (${placeholders})`
      )
      .bind(congress, session, ...chunk)
      .all<{ bioguide_id: string; position: string }>();

    for (const row of results ?? []) {
      const tally = tallies.get(row.bioguide_id);
      if (!tally) continue;
      tally.votes_cast += 1;
      const side = normalizeVotePosition(row.position);
      if (side === "yea") tally.yea_count += 1;
      else if (side === "nay") tally.nay_count += 1;
    }
  }
  return tallies;
}

async function countCrossVotesForBioguides(
  db: D1Database,
  congress: number,
  session: number,
  bioguideIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of bioguideIds) counts.set(id, 0);
  if (bioguideIds.length === 0) return counts;

  for (let i = 0; i < bioguideIds.length; i += ID_LOOKUP_CHUNK) {
    const chunk = bioguideIds.slice(i, i + ID_LOOKUP_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT bioguide_id, COUNT(*) AS count
         FROM member_cross_votes
         WHERE congress = ? AND session = ?
           AND bioguide_id IN (${placeholders})
         GROUP BY bioguide_id`
      )
      .bind(congress, session, ...chunk)
      .all<{ bioguide_id: string; count: number }>();

    for (const row of results ?? []) {
      counts.set(row.bioguide_id, row.count);
    }
  }
  return counts;
}

/** Recompute and upsert session tallies for the given members. */
export async function refreshMemberSessionStatsForBioguides(
  db: D1Database,
  congress: number,
  session: number,
  bioguideIds: string[]
): Promise<void> {
  await ensureSchema(db);
  const unique = [...new Set(bioguideIds)];
  if (unique.length === 0) return;

  const tallies = await tallyPositionsForBioguides(db, congress, session, unique);
  const crossCounts = await countCrossVotesForBioguides(db, congress, session, unique);
  const now = new Date().toISOString();

  const stmt = db.prepare(
    `INSERT INTO member_session_stats (
       bioguide_id, congress, session, votes_cast, yea_count, nay_count,
       cross_vote_count, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bioguide_id, congress, session) DO UPDATE SET
       votes_cast = excluded.votes_cast,
       yea_count = excluded.yea_count,
       nay_count = excluded.nay_count,
       cross_vote_count = excluded.cross_vote_count,
       updated_at = excluded.updated_at`
  );

  // Drop rows that no longer have votes (e.g. after a roll rewrite removed them).
  const toUpsert: string[] = [];
  const toDelete: string[] = [];
  for (const id of unique) {
    const tally = tallies.get(id) ?? { votes_cast: 0, yea_count: 0, nay_count: 0 };
    if (tally.votes_cast === 0) toDelete.push(id);
    else toUpsert.push(id);
  }

  if (toUpsert.length > 0) {
    await db.batch(
      toUpsert.map((id) => {
        const tally = tallies.get(id)!;
        return stmt.bind(
          id,
          congress,
          session,
          tally.votes_cast,
          tally.yea_count,
          tally.nay_count,
          crossCounts.get(id) ?? 0,
          now
        );
      })
    );
  }

  for (let i = 0; i < toDelete.length; i += ID_LOOKUP_CHUNK) {
    const chunk = toDelete.slice(i, i + ID_LOOKUP_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    await db
      .prepare(
        `DELETE FROM member_session_stats
         WHERE congress = ? AND session = ?
           AND bioguide_id IN (${placeholders})`
      )
      .bind(congress, session, ...chunk)
      .run();
  }
}

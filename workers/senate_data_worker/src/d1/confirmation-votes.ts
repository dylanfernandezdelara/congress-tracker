import type { ConfirmationVote } from "../types";
import { ensureSchema } from "./schema";

export async function upsertConfirmationVote(
  db: D1Database,
  vote: ConfirmationVote
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO confirmation_votes (
         chamber, congress, session, roll_number,
         nomination_congress, nomination_number, part_number,
         question, result, yeas, nays, vote_date
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chamber, congress, session, roll_number) DO UPDATE SET
         nomination_congress = excluded.nomination_congress,
         nomination_number = excluded.nomination_number,
         part_number = excluded.part_number,
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
      vote.nomination.congress,
      vote.nomination.number,
      vote.nomination.partNumber,
      vote.question,
      vote.result,
      vote.yeas,
      vote.nays,
      vote.voteDate
    )
    .run();
}

export interface ConfirmationVoteJoinRow {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  nomination_congress: number;
  nomination_number: number;
  part_number: number;
  question: string;
  result: string;
  yeas: number;
  nays: number;
  vote_date: string;
  citation: string | null;
  description: string | null;
  organization: string | null;
  position_title: string | null;
  nominees_json: string | null;
  raw_background_text: string | null;
  background_json: string | null;
}

/**
 * Recent nomination confirmation rolls in the lookback window (newest first).
 * Callers should filter with {@link isConfirmedResult} for approved outcomes.
 */
export async function selectRecentConfirmationVotes(
  db: D1Database,
  lookbackDate: string,
  limit: number
): Promise<ConfirmationVoteJoinRow[]> {
  await ensureSchema(db);
  // Over-fetch so callers can drop rejected rolls while still filling `limit`.
  const fetchLimit = Math.max(limit * 3, limit);
  const { results } = await db
    .prepare(
      `SELECT
         cv.chamber, cv.congress, cv.session, cv.roll_number,
         cv.nomination_congress, cv.nomination_number, cv.part_number,
         cv.question, cv.result, cv.yeas, cv.nays, cv.vote_date,
         n.citation, n.description, n.organization, n.position_title,
         n.nominees_json, n.raw_background_text, n.background_json
       FROM confirmation_votes cv
       LEFT JOIN nominations n
         ON n.congress = cv.nomination_congress
        AND n.nomination_number = cv.nomination_number
        AND n.part_number = cv.part_number
       WHERE cv.vote_date >= ?
       ORDER BY cv.vote_date DESC, cv.roll_number DESC
       LIMIT ?`
    )
    .bind(lookbackDate, fetchLimit)
    .all<ConfirmationVoteJoinRow>();

  return results ?? [];
}

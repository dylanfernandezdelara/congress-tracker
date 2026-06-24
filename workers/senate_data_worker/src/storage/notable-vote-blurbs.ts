import { ensureSchema } from "../d1/schema";

export interface NotableVoteBlurbRow {
  why_it_matters: string;
  detection_method: "llm" | "heuristic";
}

export async function getNotableVoteBlurb(
  db: D1Database,
  roll: { chamber: string; congress: number; session: number; roll_number: number }
): Promise<NotableVoteBlurbRow | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT why_it_matters, detection_method
       FROM notable_vote_blurbs
       WHERE chamber = ? AND congress = ? AND session = ? AND roll_number = ?`
    )
    .bind(roll.chamber, roll.congress, roll.session, roll.roll_number)
    .first<{ why_it_matters: string; detection_method: "llm" | "heuristic" }>();

  return row ?? null;
}

export async function upsertNotableVoteBlurb(
  db: D1Database,
  roll: { chamber: string; congress: number; session: number; roll_number: number },
  blurb: NotableVoteBlurbRow
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO notable_vote_blurbs
         (chamber, congress, session, roll_number, why_it_matters, detection_method, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chamber, congress, session, roll_number) DO UPDATE SET
         why_it_matters = excluded.why_it_matters,
         detection_method = excluded.detection_method,
         updated_at = excluded.updated_at`
    )
    .bind(
      roll.chamber,
      roll.congress,
      roll.session,
      roll.roll_number,
      blurb.why_it_matters,
      blurb.detection_method,
      now,
      now
    )
    .run();
}

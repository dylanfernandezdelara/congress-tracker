import { ensureSchema } from "./schema";
import { normalizeBillType } from "../sources/bill-type";
import type { BillRef } from "../types";

export type SummaryFeedbackKind = "helpful" | "unhelpful" | "mistake";

/** Per reader per day: all feedback, and mistake reports per bill. Enough for real use, a wall for scripts. */
export const FEEDBACK_MAX_PER_CLIENT_PER_DAY = 30;
export const FEEDBACK_MAX_MISTAKES_PER_BILL_PER_DAY = 3;

export interface SummaryFeedback {
  ref: BillRef;
  kind: SummaryFeedbackKind;
  note: string | null;
  clientHash: string;
  summary: { headline: string | null; model: string | null; promptVersion: string | null; fingerprint: string | null };
}

/** True when this reader has already sent the day's maximum. */
export async function overDailyLimit(db: D1Database, clientHash: string, nowIso = new Date().toISOString()): Promise<boolean> {
  await ensureSchema(db);
  const row = await db
    .prepare(`SELECT count(*) AS total FROM digest_feedback WHERE client_hash = ?1 AND created_at >= ?2`)
    .bind(clientHash, `${nowIso.slice(0, 10)}T00:00:00.000Z`)
    .first<{ total: number }>();
  return (row?.total ?? 0) >= FEEDBACK_MAX_PER_CLIENT_PER_DAY;
}

/**
 * Store one piece of feedback. A helpful/unhelpful vote replaces the reader's earlier vote on the same bill that day
 * (changing your mind is not a second vote). Returns "rate_limited" past the daily caps.
 */
export async function recordSummaryFeedback(
  db: D1Database,
  feedback: SummaryFeedback,
  nowIso = new Date().toISOString()
): Promise<"recorded" | "rate_limited"> {
  await ensureSchema(db);
  const day = nowIso.slice(0, 10);
  const type = normalizeBillType(feedback.ref.type);
  const counts = await db
    .prepare(
      `SELECT count(*) AS total,
              sum(CASE WHEN kind = 'mistake' AND congress = ?3 AND bill_type = ?4 AND number = ?5 THEN 1 ELSE 0 END) AS mistakes
       FROM digest_feedback WHERE client_hash = ?1 AND created_at >= ?2`
    )
    .bind(feedback.clientHash, `${day}T00:00:00.000Z`, feedback.ref.congress, type, feedback.ref.number)
    .first<{ total: number; mistakes: number | null }>();
  if ((counts?.total ?? 0) >= FEEDBACK_MAX_PER_CLIENT_PER_DAY) return "rate_limited";
  if (feedback.kind === "mistake" && (counts?.mistakes ?? 0) >= FEEDBACK_MAX_MISTAKES_PER_BILL_PER_DAY) return "rate_limited";

  const insert = db
    .prepare(
      `INSERT INTO digest_feedback (congress, bill_type, number, kind, note, headline, model, prompt_version, fingerprint, client_hash, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    )
    .bind(
      feedback.ref.congress,
      type,
      feedback.ref.number,
      feedback.kind,
      feedback.note,
      feedback.summary.headline,
      feedback.summary.model,
      feedback.summary.promptVersion,
      feedback.summary.fingerprint,
      feedback.clientHash,
      nowIso
    );
  // Rate limits only look at today, so earlier days' hashes are erased: stored feedback cannot be tied to a reader.
  const forget = db
    .prepare(`UPDATE digest_feedback SET client_hash = '' WHERE client_hash != '' AND created_at < ?1`)
    .bind(`${day}T00:00:00.000Z`);
  if (feedback.kind === "mistake") {
    await db.batch([insert, forget]);
  } else {
    await db.batch([
      forget,
      db
        .prepare(
          `DELETE FROM digest_feedback WHERE client_hash = ?1 AND congress = ?2 AND bill_type = ?3 AND number = ?4
             AND kind IN ('helpful', 'unhelpful') AND created_at >= ?5`
        )
        .bind(feedback.clientHash, feedback.ref.congress, type, feedback.ref.number, `${day}T00:00:00.000Z`),
      insert,
    ]);
  }
  return "recorded";
}

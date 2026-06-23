import { ensureSchema } from "./schema";
import { congressNumber, type Env } from "../config";

export interface FeedPipelineRunRecord {
  completed_at: string;
  trigger: "scheduled" | "admin";
  votesUpserted: number;
  votesSkipped: number;
  billsSelected: number;
  digestsWritten: number;
  digestsSkipped: number;
}

const FEED_PIPELINE_STATE_KEY = "feed_pipeline_last_run";

type FeedPipelineRunInput = Omit<FeedPipelineRunRecord, "completed_at" | "trigger">;

export async function recordFeedPipelineRun(
  db: D1Database,
  trigger: FeedPipelineRunRecord["trigger"],
  result: FeedPipelineRunInput
): Promise<void> {
  await ensureSchema(db);
  const completedAt = new Date().toISOString();
  const record: FeedPipelineRunRecord = {
    completed_at: completedAt,
    trigger,
    ...result,
  };
  await db
    .prepare(
      `INSERT INTO pipeline_state (key, value_json, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    )
    .bind(FEED_PIPELINE_STATE_KEY, JSON.stringify(record), completedAt)
    .run();
}

export async function getFeedPipelineRun(
  db: D1Database
): Promise<FeedPipelineRunRecord | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(`SELECT value_json FROM pipeline_state WHERE key = ?1`)
    .bind(FEED_PIPELINE_STATE_KEY)
    .first<{ value_json: string }>();
  if (!row?.value_json) return null;
  try {
    return JSON.parse(row.value_json) as FeedPipelineRunRecord;
  } catch {
    return null;
  }
}

export async function getLatestPassageVoteDate(env: Env): Promise<string | null> {
  await ensureSchema(env.DB);
  const row = await env.DB
    .prepare(
      `SELECT MAX(vote_date) AS latest_passage_vote_date
       FROM votes
       WHERE is_passage = 1 AND congress = ?1`
    )
    .bind(congressNumber(env))
    .first<{ latest_passage_vote_date: string | null }>();
  return row?.latest_passage_vote_date ?? null;
}

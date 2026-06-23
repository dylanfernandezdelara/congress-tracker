import { ensureSchema } from "./schema";
import { congressNumber, type Env } from "../config";
import type {
  FeedPipelineFailureRecord,
  FeedPipelineRunRecord,
  FeedPipelineTrigger,
} from "../../../../shared/ingest-api-types";

const FEED_PIPELINE_LAST_SUCCESS_KEY = "feed_pipeline_last_success";
const FEED_PIPELINE_LAST_FAILURE_KEY = "feed_pipeline_last_failure";

type FeedPipelineRunInput = Omit<FeedPipelineRunRecord, "completed_at" | "trigger">;

async function upsertPipelineState(
  db: D1Database,
  key: string,
  value: unknown,
  updatedAt: string
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO pipeline_state (key, value_json, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    )
    .bind(key, JSON.stringify(value), updatedAt)
    .run();
}

async function readPipelineState<T>(db: D1Database, key: string): Promise<T | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(`SELECT value_json FROM pipeline_state WHERE key = ?1`)
    .bind(key)
    .first<{ value_json: string }>();
  if (!row?.value_json) return null;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

export async function recordFeedPipelineSuccess(
  db: D1Database,
  trigger: FeedPipelineTrigger,
  result: FeedPipelineRunInput
): Promise<void> {
  const completedAt = new Date().toISOString();
  const record: FeedPipelineRunRecord = {
    completed_at: completedAt,
    trigger,
    ...result,
  };
  await upsertPipelineState(db, FEED_PIPELINE_LAST_SUCCESS_KEY, record, completedAt);
}

export async function recordFeedPipelineFailure(
  db: D1Database,
  trigger: FeedPipelineTrigger,
  error: string
): Promise<void> {
  const failedAt = new Date().toISOString();
  const record: FeedPipelineFailureRecord = {
    failed_at: failedAt,
    trigger,
    error,
  };
  await upsertPipelineState(db, FEED_PIPELINE_LAST_FAILURE_KEY, record, failedAt);
}

export async function getFeedPipelineSuccess(
  db: D1Database
): Promise<FeedPipelineRunRecord | null> {
  return readPipelineState<FeedPipelineRunRecord>(db, FEED_PIPELINE_LAST_SUCCESS_KEY);
}

export async function getFeedPipelineFailure(
  db: D1Database
): Promise<FeedPipelineFailureRecord | null> {
  return readPipelineState<FeedPipelineFailureRecord>(db, FEED_PIPELINE_LAST_FAILURE_KEY);
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

export async function getMissingDigestCount(env: Env): Promise<number> {
  await ensureSchema(env.DB);
  const row = await env.DB
    .prepare(
      `SELECT COUNT(*) AS missing_count
       FROM bill_digests
       WHERE congress = ?1 AND digest_json IS NULL`
    )
    .bind(congressNumber(env))
    .first<{ missing_count: number }>();
  return row?.missing_count ?? 0;
}

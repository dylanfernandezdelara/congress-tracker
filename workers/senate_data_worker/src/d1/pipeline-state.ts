import { ensureSchema } from "./schema";
import { congressNumber, type Env } from "../config";
import type {
  ExecutivePipelineRunRecord,
  FeedPipelineFailureRecord,
  FeedPipelineRunRecord,
  FeedPipelineTrigger,
} from "../../../../shared/ingest-api-types";

const FEED_PIPELINE_LAST_SUCCESS_KEY = "feed_pipeline_last_success";
const FEED_PIPELINE_LAST_SCHEDULED_SUCCESS_KEY = "feed_pipeline_last_scheduled_success";
const FEED_PIPELINE_LAST_FAILURE_KEY = "feed_pipeline_last_failure";
const EXECUTIVE_POSTS_LAST_SUCCESS_KEY = "executive_posts_pipeline_last_success";
const EXECUTIVE_POSTS_LAST_FAILURE_KEY = "executive_posts_pipeline_last_failure";

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

const SENATE_BIOGUIDE_LOOKUP_KEY = "senate_bioguide_lookup";

export async function storeSenateBioguideLookup(
  db: D1Database,
  lookup: Record<string, string>
): Promise<void> {
  await upsertPipelineState(db, SENATE_BIOGUIDE_LOOKUP_KEY, lookup, new Date().toISOString());
}

export async function readSenateBioguideLookup(db: D1Database): Promise<Map<string, string>> {
  const stored = await readPipelineState<Record<string, string>>(db, SENATE_BIOGUIDE_LOOKUP_KEY);
  return new Map(Object.entries(stored ?? {}));
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
  if (trigger === "scheduled") {
    await upsertPipelineState(db, FEED_PIPELINE_LAST_SCHEDULED_SUCCESS_KEY, record, completedAt);
  }
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

export async function getFeedPipelineScheduledSuccess(
  db: D1Database
): Promise<FeedPipelineRunRecord | null> {
  return readPipelineState<FeedPipelineRunRecord>(db, FEED_PIPELINE_LAST_SCHEDULED_SUCCESS_KEY);
}

export async function getFeedPipelineFailure(
  db: D1Database
): Promise<FeedPipelineFailureRecord | null> {
  return readPipelineState<FeedPipelineFailureRecord>(db, FEED_PIPELINE_LAST_FAILURE_KEY);
}

type ExecutivePipelineRunInput = Omit<ExecutivePipelineRunRecord, "completed_at" | "trigger">;

export async function recordExecutivePostsPipelineSuccess(
  db: D1Database,
  trigger: FeedPipelineTrigger,
  result: ExecutivePipelineRunInput
): Promise<void> {
  const completedAt = new Date().toISOString();
  const record: ExecutivePipelineRunRecord = {
    completed_at: completedAt,
    trigger,
    ...result,
  };
  await upsertPipelineState(db, EXECUTIVE_POSTS_LAST_SUCCESS_KEY, record, completedAt);
}

export async function recordExecutivePostsPipelineFailure(
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
  await upsertPipelineState(db, EXECUTIVE_POSTS_LAST_FAILURE_KEY, record, failedAt);
}

export async function getExecutivePostsPipelineSuccess(
  db: D1Database
): Promise<ExecutivePipelineRunRecord | null> {
  return readPipelineState<ExecutivePipelineRunRecord>(db, EXECUTIVE_POSTS_LAST_SUCCESS_KEY);
}

export async function getExecutivePostsPipelineFailure(
  db: D1Database
): Promise<FeedPipelineFailureRecord | null> {
  return readPipelineState<FeedPipelineFailureRecord>(db, EXECUTIVE_POSTS_LAST_FAILURE_KEY);
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

/**
 * Count digests the feed would treat as missing — mirrors `parseStoredDigest`:
 * null JSON, invalid JSON, or JSON lacking a non-empty headline/what_it_does.
 *
 * D1/`json_extract` throws on malformed JSON, so invalid rows are gated with
 * `json_valid` and extracts only run over a CASE-nullified payload.
 */
export async function getMissingDigestCount(env: Env): Promise<number> {
  await ensureSchema(env.DB);
  const row = await env.DB
    .prepare(
      `SELECT COUNT(*) AS missing_count
       FROM bill_digests
       WHERE congress = ?1
         AND (
           digest_json IS NULL
           OR json_valid(digest_json) = 0
           OR COALESCE(
                json_extract(
                  CASE WHEN json_valid(digest_json) = 1 THEN digest_json END,
                  '$.headline'
                ),
                ''
              ) = ''
           OR COALESCE(
                json_extract(
                  CASE WHEN json_valid(digest_json) = 1 THEN digest_json END,
                  '$.what_it_does'
                ),
                ''
              ) = ''
         )`
    )
    .bind(congressNumber(env))
    .first<{ missing_count: number }>();
  return row?.missing_count ?? 0;
}

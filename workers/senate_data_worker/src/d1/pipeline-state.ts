import { ensureSchema } from "./schema";
import { congressNumber, type Env } from "../config";
import {
  EXECUTIVE_SIGNAL_LOOKBACK_DAYS,
  INTRO_LOOKBACK_DAYS,
  VOTE_LOOKBACK_DAYS,
} from "../constants";
import { daysAgoLookbackStartIso, inclusiveLookbackStartIso } from "../../../../shared/lookback";
import { feedMembershipBinds, feedMembershipCteSql } from "./feed-membership";
import type {
  ExecutivePipelineRunRecord,
  FeedPipelineFailureRecord,
  FeedPipelineRunRecord,
  FeedPipelineSkipRecord,
  FeedPipelineTrigger,
} from "../../../../shared/ingest-api-types";

const FEED_PIPELINE_LAST_SUCCESS_KEY = "feed_pipeline_last_success";
const FEED_PIPELINE_LAST_SCHEDULED_SUCCESS_KEY = "feed_pipeline_last_scheduled_success";
const FEED_PIPELINE_LAST_FAILURE_KEY = "feed_pipeline_last_failure";
const FEED_PIPELINE_LAST_SKIPPED_KEY = "feed_pipeline_last_skipped";
const EXECUTIVE_POSTS_LAST_SUCCESS_KEY = "executive_posts_pipeline_last_success";
const EXECUTIVE_POSTS_LAST_SCHEDULED_SUCCESS_KEY =
  "executive_posts_pipeline_last_scheduled_success";
const EXECUTIVE_POSTS_LAST_FAILURE_KEY = "executive_posts_pipeline_last_failure";

type FeedPipelineRunInput = Omit<FeedPipelineRunRecord, "completed_at" | "trigger">;

const PIPELINE_STATE_UPSERT_SQL = `INSERT INTO pipeline_state (key, value_json, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`;

function preparePipelineStateUpsert(
  db: D1Database,
  key: string,
  value: unknown,
  updatedAt: string
): D1PreparedStatement {
  return db
    .prepare(PIPELINE_STATE_UPSERT_SQL)
    .bind(key, JSON.stringify(value), updatedAt);
}

async function upsertPipelineState(
  db: D1Database,
  key: string,
  value: unknown,
  updatedAt: string
): Promise<void> {
  await ensureSchema(db);
  await preparePipelineStateUpsert(db, key, value, updatedAt).run();
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

/** Generic pipeline_state read for resumable backfill watermarks. */
export async function getPipelineState<T>(db: D1Database, key: string): Promise<T | null> {
  return readPipelineState<T>(db, key);
}

/** Generic pipeline_state write for resumable backfill watermarks. */
export async function setPipelineState(
  db: D1Database,
  key: string,
  value: unknown
): Promise<void> {
  await upsertPipelineState(db, key, value, new Date().toISOString());
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

/**
 * Write last-success always; also write scheduled-success when trigger is cron.
 * Scheduled runs use a single D1 batch so both keys succeed or neither does —
 * a partial write would leave the dedicated scheduled key lagging behind
 * last_success and falsely report failed/stale.
 */
async function recordTriggeredSuccess<T extends { trigger: FeedPipelineTrigger; completed_at: string }>(
  db: D1Database,
  keys: { lastKey: string; scheduledKey: string },
  trigger: FeedPipelineTrigger,
  record: T
): Promise<void> {
  const updatedAt = record.completed_at;
  await ensureSchema(db);
  const lastStmt = preparePipelineStateUpsert(db, keys.lastKey, record, updatedAt);
  if (trigger === "scheduled") {
    const scheduledStmt = preparePipelineStateUpsert(db, keys.scheduledKey, record, updatedAt);
    await db.batch([lastStmt, scheduledStmt]);
    return;
  }
  await lastStmt.run();
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
  await recordTriggeredSuccess(
    db,
    {
      lastKey: FEED_PIPELINE_LAST_SUCCESS_KEY,
      scheduledKey: FEED_PIPELINE_LAST_SCHEDULED_SUCCESS_KEY,
    },
    trigger,
    record
  );
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

export async function recordFeedPipelineSkipped(
  db: D1Database,
  trigger: FeedPipelineTrigger,
  reason: FeedPipelineSkipRecord["reason"]
): Promise<void> {
  const skippedAt = new Date().toISOString();
  const record: FeedPipelineSkipRecord = {
    skipped_at: skippedAt,
    trigger,
    reason,
  };
  await upsertPipelineState(db, FEED_PIPELINE_LAST_SKIPPED_KEY, record, skippedAt);
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

export async function getFeedPipelineSkipped(
  db: D1Database
): Promise<FeedPipelineSkipRecord | null> {
  return readPipelineState<FeedPipelineSkipRecord>(db, FEED_PIPELINE_LAST_SKIPPED_KEY);
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
  await recordTriggeredSuccess(
    db,
    {
      lastKey: EXECUTIVE_POSTS_LAST_SUCCESS_KEY,
      scheduledKey: EXECUTIVE_POSTS_LAST_SCHEDULED_SUCCESS_KEY,
    },
    trigger,
    record
  );
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

export async function getExecutivePostsPipelineScheduledSuccess(
  db: D1Database
): Promise<ExecutivePipelineRunRecord | null> {
  return readPipelineState<ExecutivePipelineRunRecord>(
    db,
    EXECUTIVE_POSTS_LAST_SCHEDULED_SUCCESS_KEY
  );
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
 * Count incomplete digests for every bill that can appear on
 * `/feed/latest` (passage ∪ executive-linked ∪ intros). Session-backfill
 * rows outside that membership are expected to lack rewrites and must not
 * look like a stuck feed.
 *
 * Mirrors `parseStoredDigest`: missing digest row, null JSON, invalid JSON,
 * or JSON lacking a non-empty headline/what_it_does.
 *
 * D1/`json_extract` throws on malformed JSON, so invalid rows are gated with
 * `json_valid` and extracts only run over a CASE-nullified payload.
 */
export async function getMissingDigestCount(
  env: Env,
  asOf: Date = new Date()
): Promise<number> {
  await ensureSchema(env.DB);
  const voteLookback = daysAgoLookbackStartIso(VOTE_LOOKBACK_DAYS, asOf);
  const executiveSince = daysAgoLookbackStartIso(EXECUTIVE_SIGNAL_LOOKBACK_DAYS, asOf);
  const introLookback = inclusiveLookbackStartIso(INTRO_LOOKBACK_DAYS, asOf);
  const row = await env.DB
    .prepare(
      `${feedMembershipCteSql(true)}
       SELECT COUNT(*) AS missing_count
       FROM (
         SELECT bill_congress, bill_type, bill_number
         FROM combined
         GROUP BY bill_congress, bill_type, bill_number
       ) f
       LEFT JOIN bill_digests d
         ON d.congress = f.bill_congress
        AND UPPER(d.bill_type) = UPPER(f.bill_type)
        AND d.number = f.bill_number
       WHERE d.digest_json IS NULL
          OR json_valid(d.digest_json) = 0
          OR COALESCE(
               json_extract(
                 CASE WHEN json_valid(d.digest_json) = 1 THEN d.digest_json END,
                 '$.headline'
               ),
               ''
             ) = ''
          OR COALESCE(
               json_extract(
                 CASE WHEN json_valid(d.digest_json) = 1 THEN d.digest_json END,
                 '$.what_it_does'
               ),
               ''
             ) = ''`
    )
    .bind(...feedMembershipBinds(voteLookback, executiveSince, introLookback, true))
    .first<{ missing_count: number }>();
  return row?.missing_count ?? 0;
}

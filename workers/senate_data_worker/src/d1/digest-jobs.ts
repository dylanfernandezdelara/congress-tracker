import { ensureSchema } from "./schema";
import { normalizeBillType } from "../sources/bill-type";
import type { BillRef } from "../types";
import { DIGEST_SOURCE_TITLE_FALLBACK } from "./digests";

/**
 * The plain-language summary queue. A job is one bill: "queued" when its sources may have changed, "batched" while
 * its first pass is in a Luna batch, "done" once its summary is current. Tiers only go up: a bill that matters
 * (floor vote, reported by committee, law, in the feed) is rewritten by Sonnet.
 */

export type JobTier = "new" | "rewrite";

export interface DigestJob extends BillRef {
  tier: JobTier;
  /** Floor action, committee report or enactment on record (tier is raised to rewrite when true). */
  matters: boolean;
  attempts: number;
  batchId: string | null;
  fingerprint: string | null;
  /** Consecutive runs in which the bill could not be read at all (Congress.gov errors, a bad reference). */
  readFailures: number;
  /** "backfill" for jobs queued only by the backfill: they go last and get a capped share of the budget. */
  origin: JobOrigin;
}

export type JobOrigin = "live" | "backfill";

interface JobRow {
  congress: number;
  bill_type: string;
  number: number;
  tier: JobTier;
  matters: number;
  attempts: number;
  batch_id: string | null;
  fingerprint: string | null;
  read_failures: number | null;
  origin: JobOrigin | null;
}

const toJob = (row: JobRow): DigestJob => ({
  congress: row.congress,
  type: normalizeBillType(row.bill_type),
  number: row.number,
  tier: row.tier,
  matters: row.matters === 1 || row.tier === "rewrite",
  attempts: row.attempts,
  batchId: row.batch_id,
  fingerprint: row.fingerprint,
  readFailures: row.read_failures ?? 0,
  origin: row.origin ?? "live",
});

/**
 * Floor votes, floor actions, committee reports or enactment. Older rows in some tables store the type lowercase.
 * Refers to the outer row as `j` and reads only its congress, bill_type and number, so it works over any table with
 * those columns (digest_jobs, bill_digests).
 */
const MATTERS_SQL = `(
  EXISTS (SELECT 1 FROM votes v WHERE v.bill_congress = j.congress AND v.bill_type IN (j.bill_type, lower(j.bill_type)) AND v.bill_number = j.number)
  OR EXISTS (SELECT 1 FROM bill_floor_events f WHERE f.congress = j.congress AND f.bill_type IN (j.bill_type, lower(j.bill_type)) AND f.bill_number = j.number)
  OR EXISTS (SELECT 1 FROM bill_committee_events c WHERE c.congress = j.congress AND c.bill_type IN (j.bill_type, lower(j.bill_type)) AND c.bill_number = j.number AND c.activity_key = 'advanced')
  OR EXISTS (SELECT 1 FROM bill_lifecycle l WHERE l.congress = j.congress AND l.bill_type IN (j.bill_type, lower(j.bill_type)) AND l.bill_number = j.number AND l.became_law_date IS NOT NULL)
)`;

/**
 * Queue bills for a summary check. A bill already in a batch stays there (collection re-checks its fingerprint);
 * the tier never goes down. `changedOn` (a bill's Congress.gov update day, YYYY-MM-DD) skips a bill already checked
 * on a later day: nothing it is summarized from can have changed since.
 */
export async function enqueueDigestJobs(
  db: D1Database,
  bills: Array<BillRef & { changedOn?: string | null }>,
  tier: JobTier,
  nowIso = new Date().toISOString(),
  origin: JobOrigin = "live"
): Promise<void> {
  if (bills.length === 0) return;
  await ensureSchema(db);
  await db.batch(
    bills.map((bill) =>
      db
        .prepare(
          `INSERT INTO digest_jobs (congress, bill_type, number, state, tier, attempts, queued_at, updated_at, origin)
           VALUES (?1, ?2, ?3, 'queued', ?4, 0, ?5, ?5, ?7)
           ON CONFLICT (congress, bill_type, number) DO UPDATE SET
             -- A live reason (discovery, the feed) takes a bill out of the backfill's lane.
             origin = CASE WHEN excluded.origin = 'live' THEN 'live' ELSE digest_jobs.origin END,
             state = CASE
               WHEN digest_jobs.state = 'batched' THEN 'batched'
               WHEN digest_jobs.state = 'done' AND ?6 IS NOT NULL AND substr(digest_jobs.updated_at, 1, 10) > ?6 THEN 'done'
               ELSE 'queued' END,
             tier = CASE WHEN digest_jobs.tier = 'rewrite' THEN 'rewrite' ELSE excluded.tier END,
             queued_at = CASE
               WHEN digest_jobs.state = 'queued' THEN digest_jobs.queued_at
               WHEN digest_jobs.state = 'done' AND ?6 IS NOT NULL AND substr(digest_jobs.updated_at, 1, 10) > ?6 THEN digest_jobs.queued_at
               ELSE excluded.queued_at END`
        )
        .bind(bill.congress, normalizeBillType(bill.type), bill.number, tier, nowIso, bill.changedOn ?? null, origin)
    )
  );
}

/** Queued jobs, live before backfill, oldest first, split by whether they matter (so rewrites cannot starve new bills or the reverse). */
export async function selectQueuedJobs(
  db: D1Database,
  params: { matters: boolean; limit: number }
): Promise<DigestJob[]> {
  if (params.limit <= 0) return [];
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT j.congress, j.bill_type, j.number, j.tier, j.attempts, j.batch_id, j.fingerprint, j.read_failures, j.origin, j.queued_at,
                CASE WHEN j.tier = 'rewrite' OR ${MATTERS_SQL} THEN 1 ELSE 0 END AS matters
         FROM digest_jobs j
         WHERE j.state = 'queued'
       )
       WHERE matters = ?1
       ORDER BY origin = 'backfill', queued_at
       LIMIT ?2`
    )
    .bind(params.matters ? 1 : 0, params.limit)
    .all<JobRow>();
  return (results ?? []).map(toJob);
}

export async function selectBatchJobs(db: D1Database, batchId: string): Promise<DigestJob[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT j.congress, j.bill_type, j.number, j.tier, j.attempts, j.batch_id, j.fingerprint, j.read_failures, j.origin,
              CASE WHEN j.tier = 'rewrite' OR ${MATTERS_SQL} THEN 1 ELSE 0 END AS matters
       FROM digest_jobs j
       WHERE j.batch_id = ?1 AND j.state = 'batched'`
    )
    .bind(batchId)
    .all<JobRow>();
  return (results ?? []).map(toJob);
}

export async function markJobsBatched(
  db: D1Database,
  jobs: Array<{ ref: BillRef; fingerprint: string }>,
  batchId: string,
  nowIso = new Date().toISOString()
): Promise<void> {
  if (jobs.length === 0) return;
  await db.batch(
    jobs.map(({ ref, fingerprint }) =>
      db
        .prepare(
          `UPDATE digest_jobs SET state = 'batched', batch_id = ?4, updated_at = ?6, read_failures = 0,
             attempts = CASE WHEN fingerprint = ?5 THEN attempts + 1 ELSE 1 END, fingerprint = ?5
           WHERE congress = ?1 AND bill_type = ?2 AND number = ?3`
        )
        .bind(ref.congress, normalizeBillType(ref.type), ref.number, batchId, fingerprint, nowIso)
    )
  );
}

/**
 * Finish a job ("done"), or put it back in the queue (a changed bill, an expired batch). `fingerprint` and
 * `attempts` record what the last try was written from and how many tries those inputs have had.
 */
export async function settleJob(
  db: D1Database,
  ref: BillRef,
  state: "done" | "queued",
  params: { error?: string | null; nowIso?: string; fingerprint?: string; attempts?: number; readFailures?: number } = {}
): Promise<void> {
  const now = params.nowIso ?? new Date().toISOString();
  await db
    .prepare(
      `UPDATE digest_jobs SET state = ?4, batch_id = NULL, last_error = ?5, updated_at = ?6,
         queued_at = CASE WHEN ?4 = 'queued' THEN ?6 ELSE queued_at END,
         fingerprint = COALESCE(?7, fingerprint),
         attempts = COALESCE(?8, attempts),
         read_failures = COALESCE(?9, CASE WHEN ?7 IS NOT NULL THEN 0 ELSE read_failures END)
       WHERE congress = ?1 AND bill_type = ?2 AND number = ?3`
    )
    .bind(
      ref.congress,
      normalizeBillType(ref.type),
      ref.number,
      state,
      params.error ?? null,
      now,
      params.fingerprint ?? null,
      params.attempts ?? null,
      params.readFailures ?? null
    )
    .run();
}

/**
 * Count a paid try before it is made, and move the job to the back of the queue. If the run dies mid-write (wall
 * time, a dropped admin request), the try is already counted, so a bill cannot be paid for every hour unnoticed.
 */
export async function markAttempt(
  db: D1Database,
  ref: BillRef,
  fingerprint: string,
  attempts: number,
  nowIso = new Date().toISOString()
): Promise<void> {
  await db
    .prepare(
      `UPDATE digest_jobs SET state = 'queued', batch_id = NULL, fingerprint = ?4, attempts = ?5, read_failures = 0,
         queued_at = ?6, updated_at = ?6, last_error = 'write started'
       WHERE congress = ?1 AND bill_type = ?2 AND number = ?3`
    )
    .bind(ref.congress, normalizeBillType(ref.type), ref.number, fingerprint, attempts, nowIso)
    .run();
}

/**
 * Bills whose summary is not yet written from the bill text (no summary, a title fallback, or a CRS or title-only
 * summary) and that have not been checked since `checkedBeforeIso`. Text and CRS summaries are published without
 * always moving a bill's update date, so these are re-checked on a timer. Only bills the queue already knows
 * (discovered, in the feed, or named elsewhere) are re-checked; the rest are the backfill's.
 */
export async function selectRecheckBills(
  db: D1Database,
  params: { congress: number; checkedBeforeIso: string; limit: number }
): Promise<BillRef[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT d.congress, d.bill_type, d.number
       FROM bill_digests d
       LEFT JOIN digest_jobs j ON j.congress = d.congress AND j.bill_type = d.bill_type AND j.number = d.number
       WHERE d.congress = ?1
         AND j.state = 'done' AND j.updated_at < ?2
         AND (
           d.digest_json IS NULL
           OR NOT json_valid(d.digest_json)
           OR json_extract(d.digest_json, '$.source') = ?4
           OR (json_extract(d.digest_json, '$.generator') IS NOT NULL AND json_extract(d.digest_json, '$.basis') != 'text')
         )
       ORDER BY j.updated_at
       LIMIT ?3`
    )
    .bind(params.congress, params.checkedBeforeIso, params.limit, DIGEST_SOURCE_TITLE_FALLBACK)
    .all<{ congress: number; bill_type: string; number: number }>();
  return (results ?? []).map((r) => ({ congress: r.congress, type: normalizeBillType(r.bill_type), number: r.number }));
}

export interface DigestBatchRow {
  id: string;
  model: string;
  requests: number;
  submitted_at: string;
  /** While open: the estimated charge, already counted against the day's budget. After: the actual charge. */
  cost: number | null;
}

export async function insertDigestBatch(
  db: D1Database,
  batch: { id: string; model: string; requests: number; estimate: number },
  nowIso = new Date().toISOString()
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(`INSERT INTO digest_batches (id, model, requests, state, submitted_at, cost) VALUES (?1, ?2, ?3, 'open', ?4, ?5)`)
    .bind(batch.id, batch.model, batch.requests, nowIso, batch.estimate)
    .run();
}

export async function selectOpenBatches(db: D1Database): Promise<DigestBatchRow[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(`SELECT id, model, requests, submitted_at, cost FROM digest_batches WHERE state = 'open' ORDER BY submitted_at`)
    .all<DigestBatchRow>();
  return results ?? [];
}

export async function closeDigestBatch(
  db: D1Database,
  id: string,
  state: "collected" | "failed",
  cost: number | null,
  nowIso = new Date().toISOString()
): Promise<void> {
  await db
    .prepare(`UPDATE digest_batches SET state = ?2, cost = ?3, collected_at = ?4 WHERE id = ?1`)
    .bind(id, state, cost, nowIso)
    .run();
}

/** Stub rows for newly seen bills, so the site can show them (by title) before their summary is written. */
export async function insertDigestStubs(
  db: D1Database,
  bills: Array<BillRef & { title: string | null }>,
  nowIso = new Date().toISOString()
): Promise<void> {
  const withTitle = bills.filter((b) => b.title?.trim());
  if (withTitle.length === 0) return;
  await ensureSchema(db);
  await db.batch(
    withTitle.map((b) =>
      db
        .prepare(
          `INSERT INTO bill_digests (congress, bill_type, number, title, policy_area, raw_summary_text, digest_json, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, ?5, ?5)
           ON CONFLICT (congress, bill_type, number) DO NOTHING`
        )
        .bind(b.congress, normalizeBillType(b.type), b.number, b.title, nowIso)
    )
  );
}

/** Bills of the Congress already summarized by the current writer (a Congress backfill skips them for free). */
export async function countCurrentSummaries(db: D1Database, congress: number): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT count(*) AS n FROM bill_digests
       WHERE congress = ?1 AND CASE WHEN digest_json IS NULL OR NOT json_valid(digest_json) THEN 0
         ELSE json_extract(digest_json, '$.generator') IS NOT NULL END`
    )
    .bind(congress)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Jobs waiting for a first summary (the backfill tops the queue up only when it is short). */
export async function countQueuedJobs(db: D1Database): Promise<number> {
  await ensureSchema(db);
  const row = await db.prepare(`SELECT count(*) AS n FROM digest_jobs WHERE state = 'queued'`).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Bills on the site without a summary from the current writer (none, a title fallback, or an older model's), that
 * are not already waiting in the queue. `matters` as in the queue, so the backfill can estimate Sonnet rewrites.
 */
export async function selectBackfillSiteBills(db: D1Database, congress: number): Promise<Array<BillRef & { matters: boolean }>> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT j.congress, j.bill_type, j.number, CASE WHEN ${MATTERS_SQL} THEN 1 ELSE 0 END AS matters
       FROM bill_digests j
       LEFT JOIN digest_jobs q ON q.congress = j.congress AND q.bill_type = j.bill_type AND q.number = j.number
       WHERE j.congress = ?1
         AND (q.state IS NULL OR q.state = 'done')
         AND CASE WHEN j.digest_json IS NULL OR NOT json_valid(j.digest_json) THEN 1 ELSE json_extract(j.digest_json, '$.generator') IS NULL END
       ORDER BY matters DESC, j.updated_at DESC`
    )
    .bind(congress)
    .all<{ congress: number; bill_type: string; number: number; matters: number }>();
  return (results ?? []).map((r) => ({ congress: r.congress, type: normalizeBillType(r.bill_type), number: r.number, matters: r.matters === 1 }));
}

/** Which of these bills already have a row on the site (and so should be kept current). */
export async function selectKnownBills(db: D1Database, congress: number, bills: BillRef[]): Promise<Set<string>> {
  const numbers = [...new Set(bills.map((b) => Math.trunc(b.number)).filter((n) => Number.isFinite(n) && n > 0))];
  if (numbers.length === 0) return new Set();
  await ensureSchema(db);
  const { results } = await db
    .prepare(`SELECT bill_type, number FROM bill_digests WHERE congress = ?1 AND number IN (${numbers.join(",")})`)
    .bind(congress)
    .all<{ bill_type: string; number: number }>();
  return new Set((results ?? []).map((r) => `${normalizeBillType(r.bill_type)}-${r.number}`));
}

export interface RunStatusUpdate {
  status: "success" | "partial" | "failed";
  partial: boolean;
  finishedAt: string;
  errorJson?: string;
  rowWrites?: number;
  rowReads?: number;
}

const DATASET = "v2_default";

export async function insertRunningIngestionRun(
  db: D1Database,
  runId: string,
  triggerType: string,
  windowStart: string,
  windowEnd: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ingestion_runs (
        run_id, trigger_type, status, started_at, window_start, window_end, partial
      ) VALUES (?1, ?2, 'running', ?3, ?4, ?5, 0)`
    )
    .bind(runId, triggerType, new Date().toISOString(), windowStart, windowEnd)
    .run();
}

export async function finalizeFailedRun(
  db: D1Database,
  runId: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .prepare(
      `UPDATE ingestion_runs
       SET status = 'failed', finished_at = ?2, error_json = ?3
       WHERE run_id = ?1`
    )
    .bind(runId, new Date().toISOString(), JSON.stringify({ message }))
    .run();
}

export async function publishRun(
  db: D1Database,
  runId: string,
  update: RunStatusUpdate
): Promise<void> {
  const now = new Date().toISOString();
  const stmts = [
    db
      .prepare(
        `INSERT INTO publish_pointer (dataset, active_run_id, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(dataset) DO UPDATE SET
         active_run_id = excluded.active_run_id,
         updated_at = excluded.updated_at`
      )
      .bind(DATASET, runId, now),
    db
      .prepare(
        `UPDATE ingestion_runs
         SET status = ?2,
             partial = ?3,
             finished_at = ?4,
             error_json = ?5,
             row_writes = COALESCE(?6, row_writes),
             row_reads = COALESCE(?7, row_reads)
         WHERE run_id = ?1`
      )
      .bind(
        runId,
        update.status,
        update.partial ? 1 : 0,
        update.finishedAt,
        update.errorJson ?? null,
        update.rowWrites ?? null,
        update.rowReads ?? null
      ),
  ];

  await db.batch(stmts);
}

export async function getActiveRunId(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT active_run_id FROM publish_pointer WHERE dataset = ?1")
    .bind(DATASET)
    .first<{ active_run_id: string }>();
  return row?.active_run_id ?? null;
}

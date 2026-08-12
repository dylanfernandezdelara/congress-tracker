import { PROCESS_REHYDRATE_DAYS } from "../constants";
import { normalizeBillType } from "../sources/bill-type";
import { ensureSchema } from "./schema";

export interface ProcessBillKey {
  congress: number;
  billType: string;
  billNumber: number;
}

function processRehydrateCutoffIso(): string {
  return new Date(
    Date.now() - PROCESS_REHYDRATE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
}

export async function enqueueProcessBills(
  db: D1Database,
  bills: ProcessBillKey[],
  opts: { force?: boolean } = {}
): Promise<number> {
  await ensureSchema(db);
  if (bills.length === 0) return 0;
  const now = new Date().toISOString();
  const force = opts.force === true;
  const stmts = bills.map((b) =>
    db
      .prepare(
        force
          ? `INSERT INTO process_refresh_queue (congress, bill_type, bill_number, queued_at, last_hydrated_at)
             VALUES (?, ?, ?, ?, NULL)
             ON CONFLICT(congress, bill_type, bill_number) DO UPDATE SET
               queued_at = excluded.queued_at,
               last_hydrated_at = NULL`
          : `INSERT INTO process_refresh_queue (congress, bill_type, bill_number, queued_at, last_hydrated_at)
             VALUES (?, ?, ?, ?, NULL)
             ON CONFLICT(congress, bill_type, bill_number) DO UPDATE SET
               queued_at = excluded.queued_at`
      )
      .bind(b.congress, normalizeBillType(b.billType), b.billNumber, now)
  );
  await db.batch(stmts);
  return bills.length;
}

export async function selectProcessQueueBatch(
  db: D1Database,
  limit: number
): Promise<ProcessBillKey[]> {
  await ensureSchema(db);
  const rows = await db
    .prepare(
      `SELECT congress, bill_type, bill_number
       FROM process_refresh_queue
       WHERE last_hydrated_at IS NULL OR last_hydrated_at < ?
       ORDER BY CASE WHEN last_hydrated_at IS NULL THEN 0 ELSE 1 END,
                COALESCE(last_hydrated_at, queued_at) ASC
       LIMIT ?`
    )
    .bind(processRehydrateCutoffIso(), Math.max(1, limit))
    .all<{ congress: number; bill_type: string; bill_number: number }>();
  return (rows.results ?? []).map((r) => ({
    congress: r.congress,
    billType: r.bill_type,
    billNumber: r.bill_number,
  }));
}

export async function markProcessHydrated(
  db: D1Database,
  bill: ProcessBillKey
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE process_refresh_queue
       SET last_hydrated_at = ?
       WHERE congress = ? AND bill_type = ? AND bill_number = ?`
    )
    .bind(now, bill.congress, normalizeBillType(bill.billType), bill.billNumber)
    .run();
}

export async function countProcessQueuePending(db: D1Database): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM process_refresh_queue
       WHERE last_hydrated_at IS NULL OR last_hydrated_at < ?`
    )
    .bind(processRehydrateCutoffIso())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Bills already known via digests/lifecycle/votes for process discovery. */
export async function selectKnownProcessCandidateBills(
  db: D1Database,
  congress: number,
  limit: number
): Promise<ProcessBillKey[]> {
  await ensureSchema(db);
  const rows = await db
    .prepare(
      `SELECT DISTINCT congress, bill_type, bill_number FROM (
         SELECT congress AS congress, bill_type AS bill_type, number AS bill_number
           FROM bill_digests WHERE congress = ?
         UNION
         SELECT congress, bill_type, bill_number FROM bill_lifecycle WHERE congress = ?
         UNION
         SELECT bill_congress AS congress, bill_type, bill_number FROM votes
           WHERE bill_congress = ?
       )
       LIMIT ?`
    )
    .bind(congress, congress, congress, Math.max(1, limit))
    .all<{ congress: number; bill_type: string; bill_number: number }>();
  return (rows.results ?? []).map((r) => ({
    congress: r.congress,
    billType: r.bill_type,
    billNumber: r.bill_number,
  }));
}

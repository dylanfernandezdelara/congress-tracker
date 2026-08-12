import type {
  BillProcessActivityKey,
  BillProcessCurrentStatus,
} from "../../../../shared/bill-process-labels";
import type { FeedChamber } from "../../../../shared/feed-api-types";
import { normalizeBillType } from "../sources/bill-type";
import { toProcessSummary } from "../process/derive-state";
import type { ProcessCommitteeEvent } from "../process/types";
import type { BillProcessSummary } from "../../../../shared/bill-process-api-types";
import { ensureSchema } from "./schema";

export type { ProcessCommitteeEvent };

export interface ProcessBillKey {
  congress: number;
  billType: string;
  billNumber: number;
}

export interface UpsertProcessStateParams {
  congress: number;
  billType: string;
  billNumber: number;
  originChamber: FeedChamber | null;
  currentStatus: BillProcessCurrentStatus;
  currentLabel: string | null;
  lastAdvanceAt: string | null;
}

export interface CommitteeRosterRow {
  congress: number;
  system_code: string;
  chamber: FeedChamber;
  name: string;
  committee_type: string;
  parent_system_code: string | null;
}

export interface ProcessStateRow {
  congress: number;
  bill_type: string;
  bill_number: number;
  origin_chamber: FeedChamber | null;
  current_status: BillProcessCurrentStatus;
  current_label: string | null;
  last_advance_at: string | null;
  updated_at: string;
  title?: string | null;
  policy_area?: string | null;
  headline?: string | null;
}

function billKey(congress: number, billType: string, billNumber: number): string {
  return `${congress}:${normalizeBillType(billType)}:${billNumber}`;
}

function asChamber(value: string | null | undefined): FeedChamber | null {
  if (value === "House" || value === "Senate") return value;
  return null;
}

function asActivityKey(value: string): BillProcessActivityKey {
  if (
    value === "sent" ||
    value === "hearings" ||
    value === "worked_on" ||
    value === "advanced" ||
    value === "released" ||
    value === "interest" ||
    value === "other"
  ) {
    return value;
  }
  return "other";
}

function asStatus(value: string): BillProcessCurrentStatus {
  if (
    value === "introduced" ||
    value === "in_committee" ||
    value === "in_subcommittee" ||
    value === "cleared_committee" ||
    value === "in_second_chamber_committee" ||
    value === "released_from_committee" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

/**
 * Atomically replace committee events and refresh the denormalized process
 * index for one bill. Events remain the source of truth for timeline reads;
 * `bill_process_state` is only a query index (advancing / filters).
 *
 * Empty `events` is a no-op (same pattern as `replaceBillSponsors`): a sparse
 * Congress.gov committees payload must not wipe previously stored timelines.
 */
export async function persistBillProcess(
  db: D1Database,
  params: {
    congress: number;
    billType: string;
    billNumber: number;
    events: ProcessCommitteeEvent[];
    state: UpsertProcessStateParams;
  }
): Promise<void> {
  if (params.events.length === 0) return;

  await ensureSchema(db);
  const type = normalizeBillType(params.billType);
  const now = new Date().toISOString();

  const stmts = [
    db
      .prepare(
        `DELETE FROM bill_committee_events
         WHERE congress = ? AND bill_type = ? AND bill_number = ?`
      )
      .bind(params.congress, type, params.billNumber),
    ...params.events.map((e) =>
      db
        .prepare(
          `INSERT INTO bill_committee_events (
            congress, bill_type, bill_number, system_code, activity_key, activity_at,
            chamber, committee_name, parent_system_code, activity_raw, tally_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(congress, bill_type, bill_number, system_code, activity_key, activity_at)
          DO UPDATE SET
            chamber = excluded.chamber,
            committee_name = excluded.committee_name,
            parent_system_code = excluded.parent_system_code,
            activity_raw = excluded.activity_raw,
            tally_text = COALESCE(excluded.tally_text, bill_committee_events.tally_text)`
        )
        .bind(
          e.congress,
          normalizeBillType(e.billType),
          e.billNumber,
          e.systemCode,
          e.activityKey,
          e.activityAt,
          e.chamber,
          e.committeeName,
          e.parentSystemCode,
          e.activityRaw,
          e.tallyText
        )
    ),
    db
      .prepare(
        `INSERT INTO bill_process_state (
          congress, bill_type, bill_number, origin_chamber, current_status,
          current_label, last_advance_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(congress, bill_type, bill_number) DO UPDATE SET
          origin_chamber = excluded.origin_chamber,
          current_status = excluded.current_status,
          current_label = excluded.current_label,
          last_advance_at = excluded.last_advance_at,
          updated_at = excluded.updated_at`
      )
      .bind(
        params.state.congress,
        normalizeBillType(params.state.billType),
        params.state.billNumber,
        params.state.originChamber,
        params.state.currentStatus,
        params.state.currentLabel,
        params.state.lastAdvanceAt,
        now
      ),
  ];
  await db.batch(stmts);
}

export async function upsertCommitteeRoster(
  db: D1Database,
  rows: Array<{
    congress: number;
    systemCode: string;
    chamber: FeedChamber;
    name: string;
    committeeType: string;
    parentSystemCode: string | null;
  }>
): Promise<void> {
  await ensureSchema(db);
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const stmts = rows.map((r) =>
    db
      .prepare(
        `INSERT INTO committee_roster (
          congress, system_code, chamber, name, committee_type, parent_system_code, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(congress, system_code) DO UPDATE SET
          chamber = excluded.chamber,
          name = excluded.name,
          committee_type = excluded.committee_type,
          parent_system_code = excluded.parent_system_code,
          updated_at = excluded.updated_at`
      )
      .bind(
        r.congress,
        r.systemCode,
        r.chamber,
        r.name,
        r.committeeType,
        r.parentSystemCode,
        now
      )
  );
  await db.batch(stmts);
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
       WHERE last_hydrated_at IS NULL
       ORDER BY queued_at ASC
       LIMIT ?`
    )
    .bind(Math.max(1, limit))
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
      `SELECT COUNT(*) AS n FROM process_refresh_queue WHERE last_hydrated_at IS NULL`
    )
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getCommitteeEventsForBills(
  db: D1Database,
  bills: ProcessBillKey[]
): Promise<Map<string, ProcessCommitteeEvent[]>> {
  await ensureSchema(db);
  const out = new Map<string, ProcessCommitteeEvent[]>();
  if (bills.length === 0) return out;

  // D1 caps bound parameters at 100; 3 binds/bill → chunk ≤ 30 (match votes.ts).
  const BILL_LOOKUP_CHUNK = 30;
  const chunks: ProcessBillKey[][] = [];
  for (let i = 0; i < bills.length; i += BILL_LOOKUP_CHUNK) {
    chunks.push(bills.slice(i, i + BILL_LOOKUP_CHUNK));
  }

  for (const chunk of chunks) {
    const clauses = chunk.map(() => `(congress = ? AND bill_type = ? AND bill_number = ?)`);
    const binds: Array<string | number> = [];
    for (const b of chunk) {
      binds.push(b.congress, normalizeBillType(b.billType), b.billNumber);
    }
    const rows = await db
      .prepare(
        `SELECT congress, bill_type, bill_number, system_code, activity_key, activity_at,
                chamber, committee_name, parent_system_code, activity_raw, tally_text
         FROM bill_committee_events
         WHERE ${clauses.join(" OR ")}
         ORDER BY activity_at ASC`
      )
      .bind(...binds)
      .all<{
        congress: number;
        bill_type: string;
        bill_number: number;
        system_code: string;
        activity_key: string;
        activity_at: string;
        chamber: string;
        committee_name: string;
        parent_system_code: string | null;
        activity_raw: string;
        tally_text: string | null;
      }>();

    for (const r of rows.results ?? []) {
      const chamber = asChamber(r.chamber);
      if (!chamber) continue;
      const key = billKey(r.congress, r.bill_type, r.bill_number);
      const list = out.get(key) ?? [];
      list.push({
        congress: r.congress,
        billType: r.bill_type,
        billNumber: r.bill_number,
        systemCode: r.system_code,
        activityKey: asActivityKey(r.activity_key),
        activityAt: r.activity_at,
        chamber,
        committeeName: r.committee_name,
        parentSystemCode: r.parent_system_code,
        activityRaw: r.activity_raw,
        tallyText: r.tally_text,
      });
      out.set(key, list);
    }
  }
  return out;
}

export async function getCommitteeNameMap(
  db: D1Database,
  congress: number
): Promise<Map<string, string>> {
  await ensureSchema(db);
  const rows = await db
    .prepare(`SELECT system_code, name FROM committee_roster WHERE congress = ?`)
    .bind(congress)
    .all<{ system_code: string; name: string }>();
  const map = new Map<string, string>();
  for (const r of rows.results ?? []) {
    map.set(r.system_code, r.name);
  }
  return map;
}

export async function getProcessSummariesForBills(
  db: D1Database,
  bills: ProcessBillKey[]
): Promise<Map<string, BillProcessSummary>> {
  const eventsByBill = await getCommitteeEventsForBills(db, bills);
  const congresses = [...new Set(bills.map((b) => b.congress))];
  const nameMaps = new Map<number, Map<string, string>>();
  for (const c of congresses) {
    nameMaps.set(c, await getCommitteeNameMap(db, c));
  }

  const out = new Map<string, BillProcessSummary>();
  for (const bill of bills) {
    const key = billKey(bill.congress, bill.billType, bill.billNumber);
    const events = eventsByBill.get(key) ?? [];
    const summary = toProcessSummary(
      bill.billType,
      events,
      nameMaps.get(bill.congress)
    );
    if (summary) out.set(key, summary);
  }
  return out;
}

export function processMapKey(
  congress: number,
  billType: string,
  billNumber: number
): string {
  return billKey(congress, billType, billNumber);
}

export async function selectAdvancingProcessBills(
  db: D1Database,
  congress: number,
  sinceIso: string,
  limit: number
): Promise<ProcessStateRow[]> {
  await ensureSchema(db);
  const rows = await db
    .prepare(
      `SELECT
         p.congress, p.bill_type, p.bill_number, p.origin_chamber, p.current_status,
         p.current_label, p.last_advance_at, p.updated_at,
         d.title AS title, d.policy_area AS policy_area,
         json_extract(d.digest_json, '$.headline') AS headline
       FROM bill_process_state p
       LEFT JOIN bill_digests d
         ON d.congress = p.congress
        AND UPPER(d.bill_type) = UPPER(p.bill_type)
        AND d.number = p.bill_number
       WHERE p.congress = ?
         AND p.last_advance_at IS NOT NULL
         AND p.last_advance_at >= ?
       ORDER BY p.last_advance_at DESC
       LIMIT ?`
    )
    .bind(congress, sinceIso, Math.max(1, limit))
    .all<{
      congress: number;
      bill_type: string;
      bill_number: number;
      origin_chamber: string | null;
      current_status: string;
      current_label: string | null;
      last_advance_at: string | null;
      updated_at: string;
      title: string | null;
      policy_area: string | null;
      headline: string | null;
    }>();

  return (rows.results ?? []).map((r) => ({
    congress: r.congress,
    bill_type: r.bill_type,
    bill_number: r.bill_number,
    origin_chamber: asChamber(r.origin_chamber),
    current_status: asStatus(r.current_status),
    current_label: r.current_label,
    last_advance_at: r.last_advance_at,
    updated_at: r.updated_at,
    title: r.title,
    policy_area: r.policy_area,
    headline: r.headline,
  }));
}

export async function selectStandingCommittees(
  db: D1Database,
  congress: number,
  chamber: FeedChamber
): Promise<CommitteeRosterRow[]> {
  await ensureSchema(db);
  const rows = await db
    .prepare(
      `SELECT congress, system_code, chamber, name, committee_type, parent_system_code
       FROM committee_roster
       WHERE congress = ? AND chamber = ? AND parent_system_code IS NULL
         AND committee_type = 'Standing'
       ORDER BY name ASC`
    )
    .bind(congress, chamber)
    .all<{
      congress: number;
      system_code: string;
      chamber: string;
      name: string;
      committee_type: string;
      parent_system_code: string | null;
    }>();
  return (rows.results ?? [])
    .map((r) => {
      const ch = asChamber(r.chamber);
      if (!ch) return null;
      return {
        congress: r.congress,
        system_code: r.system_code,
        chamber: ch,
        name: r.name,
        committee_type: r.committee_type,
        parent_system_code: r.parent_system_code,
      };
    })
    .filter((r): r is CommitteeRosterRow => r !== null);
}

/** All subcommittees for a chamber in one query (avoids N+1 on leaderboard). */
export async function selectSubcommitteeRosterByChamber(
  db: D1Database,
  congress: number,
  chamber: FeedChamber
): Promise<CommitteeRosterRow[]> {
  await ensureSchema(db);
  const rows = await db
    .prepare(
      `SELECT congress, system_code, chamber, name, committee_type, parent_system_code
       FROM committee_roster
       WHERE congress = ? AND chamber = ? AND parent_system_code IS NOT NULL
       ORDER BY name ASC`
    )
    .bind(congress, chamber)
    .all<{
      congress: number;
      system_code: string;
      chamber: string;
      name: string;
      committee_type: string;
      parent_system_code: string | null;
    }>();
  return (rows.results ?? [])
    .map((r) => {
      const ch = asChamber(r.chamber);
      if (!ch) return null;
      return {
        congress: r.congress,
        system_code: r.system_code,
        chamber: ch,
        name: r.name,
        committee_type: r.committee_type,
        parent_system_code: r.parent_system_code,
      };
    })
    .filter((r): r is CommitteeRosterRow => r !== null);
}

export interface CommitteeEventAggRow {
  system_code: string;
  bill_type: string;
  bill_number: number;
  activity_key: string;
  activity_at: string;
}

/** All current-congress events for a set of committee system codes (for leaderboard). */
export async function selectCommitteeEventsForCodes(
  db: D1Database,
  congress: number,
  systemCodes: string[]
): Promise<CommitteeEventAggRow[]> {
  await ensureSchema(db);
  if (systemCodes.length === 0) return [];
  // D1 100-parameter cap: 1 congress bind + N codes → chunk codes ≤ 90.
  const CODE_CHUNK = 90;
  const out: CommitteeEventAggRow[] = [];
  for (let i = 0; i < systemCodes.length; i += CODE_CHUNK) {
    const chunk = systemCodes.slice(i, i + CODE_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await db
      .prepare(
        `SELECT system_code, bill_type, bill_number, activity_key, activity_at
         FROM bill_committee_events
         WHERE congress = ? AND system_code IN (${placeholders})
           AND activity_key IN ('sent', 'worked_on', 'advanced', 'released')`
      )
      .bind(congress, ...chunk)
      .all<CommitteeEventAggRow>();
    out.push(...(rows.results ?? []));
  }
  return out;
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

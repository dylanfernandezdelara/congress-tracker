import type { BillProcessActivityKey } from "../../../../shared/bill-process-labels";
import type { BillProcessSummary } from "../../../../shared/bill-process-api-types";
import { getFloorEventsForBills } from "./bill-floor-events";
import { toProcessSummary } from "../process/derive-state";
import type { ProcessCommitteeEvent } from "../process/types";
import { normalizeBillType } from "../sources/bill-type";
import { asFeedChamber } from "../sources/congress-client";
import { getCommitteeNameMap } from "./committee-roster";
import type { ProcessBillKey } from "./process-queue";
import { ensureSchema } from "./schema";

function billKey(congress: number, billType: string, billNumber: number): string {
  return `${congress}:${normalizeBillType(billType)}:${billNumber}`;
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

/**
 * Atomically replace committee events for one bill. Events remain the source
 * of truth for timeline and waiting-count reads.
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
  }
): Promise<void> {
  if (params.events.length === 0) return;

  await ensureSchema(db);
  const type = normalizeBillType(params.billType);

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
  ];
  await db.batch(stmts);
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
      const chamber = asFeedChamber(r.chamber);
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

export async function getProcessSummariesForBills(
  db: D1Database,
  bills: ProcessBillKey[]
): Promise<Map<string, BillProcessSummary>> {
  const eventsByBill = await getCommitteeEventsForBills(db, bills);
  const floorByBill = await getFloorEventsForBills(db, bills);
  const congresses = [...new Set(bills.map((b) => b.congress))];
  const nameMaps = new Map<number, Map<string, string>>();
  for (const c of congresses) {
    nameMaps.set(c, await getCommitteeNameMap(db, c));
  }

  const out = new Map<string, BillProcessSummary>();
  for (const bill of bills) {
    const key = billKey(bill.congress, bill.billType, bill.billNumber);
    const events = eventsByBill.get(key) ?? [];
    const floorEvents = floorByBill.get(key) ?? [];
    const summary = toProcessSummary(
      bill.billType,
      events,
      nameMaps.get(bill.congress),
      floorEvents
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

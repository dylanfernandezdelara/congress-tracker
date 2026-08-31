import type { BillFloorActionKey } from "../../../../shared/bill-process-labels";
import type { ProcessFloorEvent } from "../process/types";
import { normalizeBillType } from "../sources/bill-type";
import { asFeedChamber } from "../sources/congress-client";
import type { ProcessBillKey } from "./process-queue";
import { ensureSchema } from "./schema";

function billKey(congress: number, billType: string, billNumber: number): string {
  return `${congress}:${normalizeBillType(billType)}:${billNumber}`;
}

function asFloorActionKey(value: string): BillFloorActionKey | null {
  if (
    value === "received" ||
    value === "calendar" ||
    value === "considered" ||
    value === "cloture" ||
    value === "conference"
  ) {
    return value;
  }
  return null;
}

/**
 * Atomically replace floor events for one bill.
 * Empty `events` is a no-op so a sparse Congress.gov actions page cannot wipe
 * a previously stored timeline.
 */
export async function persistBillFloorEvents(
  db: D1Database,
  params: {
    congress: number;
    billType: string;
    billNumber: number;
    events: ProcessFloorEvent[];
  }
): Promise<void> {
  if (params.events.length === 0) return;

  await ensureSchema(db);
  const type = normalizeBillType(params.billType);

  const stmts = [
    db
      .prepare(
        `DELETE FROM bill_floor_events
         WHERE congress = ? AND bill_type = ? AND bill_number = ?`
      )
      .bind(params.congress, type, params.billNumber),
    ...params.events.map((e) =>
      db
        .prepare(
          `INSERT INTO bill_floor_events (
            congress, bill_type, bill_number, action_key, action_at,
            chamber, label, raw_text, tally_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(congress, bill_type, bill_number, action_key, action_at, chamber)
          DO UPDATE SET
            label = excluded.label,
            raw_text = excluded.raw_text,
            tally_text = COALESCE(excluded.tally_text, bill_floor_events.tally_text)`
        )
        .bind(
          e.congress,
          normalizeBillType(e.billType),
          e.billNumber,
          e.actionKey,
          e.actionAt,
          e.chamber,
          e.label,
          e.rawText,
          e.tallyText
        )
    ),
  ];
  await db.batch(stmts);
}

export async function getFloorEventsForBills(
  db: D1Database,
  bills: ProcessBillKey[]
): Promise<Map<string, ProcessFloorEvent[]>> {
  await ensureSchema(db);
  const out = new Map<string, ProcessFloorEvent[]>();
  if (bills.length === 0) return out;

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
        `SELECT congress, bill_type, bill_number, action_key, action_at,
                chamber, label, raw_text, tally_text
         FROM bill_floor_events
         WHERE ${clauses.join(" OR ")}
         ORDER BY action_at ASC`
      )
      .bind(...binds)
      .all<{
        congress: number;
        bill_type: string;
        bill_number: number;
        action_key: string;
        action_at: string;
        chamber: string;
        label: string;
        raw_text: string;
        tally_text: string | null;
      }>();

    for (const r of rows.results ?? []) {
      const chamber = asFeedChamber(r.chamber);
      const actionKey = asFloorActionKey(r.action_key);
      if (!chamber || !actionKey) continue;
      const key = billKey(r.congress, r.bill_type, r.bill_number);
      const list = out.get(key) ?? [];
      list.push({
        congress: r.congress,
        billType: r.bill_type,
        billNumber: r.bill_number,
        actionKey,
        actionAt: r.action_at,
        chamber,
        label: r.label,
        rawText: r.raw_text,
        tallyText: r.tally_text,
      });
      out.set(key, list);
    }
  }
  return out;
}

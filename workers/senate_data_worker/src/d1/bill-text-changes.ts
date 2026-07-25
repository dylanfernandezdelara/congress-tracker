import type { BillAddedProvision, BillTextChanges } from "../../../../shared/bill-text-api-types";
import { normalizeBillType } from "../sources/bill-type";
import { ensureSchema } from "./schema";

export interface BillTextChangesRow {
  congress: number;
  bill_type: string;
  bill_number: number;
  summary_version: string | null;
  summary_version_date: string | null;
  latest_version: string | null;
  latest_version_date: string | null;
  added_json: string | null;
  more_added_count: number;
  checked_at: string;
}

export function billTextChangesMapKey(
  congress: number,
  billType: string,
  billNumber: number
): string {
  return `${congress}:${normalizeBillType(billType)}:${billNumber}`;
}

function parseAddedProvisions(json: string | null): BillAddedProvision[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: BillAddedProvision[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const { label, heading } = entry as Partial<BillAddedProvision>;
      if (typeof label !== "string" || typeof heading !== "string") continue;
      out.push({ label, heading });
    }
    return out;
  } catch {
    return [];
  }
}

/** API shape for a stored row, or null when the row records "nothing to show". */
export function rowToBillTextChanges(row: BillTextChangesRow): BillTextChanges | null {
  const added = parseAddedProvisions(row.added_json);
  if (added.length === 0 || !row.latest_version || !row.latest_version_date) return null;
  return {
    summary_version: row.summary_version,
    summary_version_date: row.summary_version_date,
    latest_version: row.latest_version,
    latest_version_date: row.latest_version_date,
    added_provisions: added,
    more_added_count: row.more_added_count,
  };
}

export async function upsertBillTextChanges(
  db: D1Database,
  params: {
    congress: number;
    billType: string;
    billNumber: number;
    summaryVersion: string | null;
    summaryVersionDate: string | null;
    latestVersion: string | null;
    latestVersionDate: string | null;
    addedProvisions: BillAddedProvision[];
    moreAddedCount: number;
  }
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO bill_text_changes (
        congress, bill_type, bill_number,
        summary_version, summary_version_date,
        latest_version, latest_version_date,
        added_json, more_added_count, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(congress, bill_type, bill_number) DO UPDATE SET
        summary_version = excluded.summary_version,
        summary_version_date = excluded.summary_version_date,
        latest_version = excluded.latest_version,
        latest_version_date = excluded.latest_version_date,
        added_json = excluded.added_json,
        more_added_count = excluded.more_added_count,
        checked_at = excluded.checked_at`
    )
    .bind(
      params.congress,
      normalizeBillType(params.billType),
      params.billNumber,
      params.summaryVersion,
      params.summaryVersionDate,
      params.latestVersion,
      params.latestVersionDate,
      JSON.stringify(params.addedProvisions),
      params.moreAddedCount,
      now
    )
    .run();
}

export type BillTextChangesKey = {
  congress: number;
  billType: string;
  billNumber: number;
};

/** D1 caps bound parameters; each bill uses 3 binds in the OR tuple query. */
const LOOKUP_CHUNK = 30;

export async function getBillTextChangesForBills(
  db: D1Database,
  bills: BillTextChangesKey[]
): Promise<Map<string, BillTextChangesRow>> {
  await ensureSchema(db);
  const map = new Map<string, BillTextChangesRow>();
  if (bills.length === 0) return map;

  const unique = new Map<string, BillTextChangesKey>();
  for (const bill of bills) {
    unique.set(billTextChangesMapKey(bill.congress, bill.billType, bill.billNumber), {
      congress: bill.congress,
      billType: normalizeBillType(bill.billType),
      billNumber: bill.billNumber,
    });
  }
  const list = [...unique.values()];

  for (let i = 0; i < list.length; i += LOOKUP_CHUNK) {
    const chunk = list.slice(i, i + LOOKUP_CHUNK);
    const clauses = chunk
      .map(() => "(congress = ? AND UPPER(bill_type) = ? AND bill_number = ?)")
      .join(" OR ");
    const binds: Array<string | number> = [];
    for (const bill of chunk) {
      binds.push(bill.congress, bill.billType, bill.billNumber);
    }
    const { results } = await db
      .prepare(
        `SELECT congress, bill_type, bill_number,
                summary_version, summary_version_date,
                latest_version, latest_version_date,
                added_json, more_added_count, checked_at
         FROM bill_text_changes
         WHERE ${clauses}`
      )
      .bind(...binds)
      .all<BillTextChangesRow>();

    for (const row of results ?? []) {
      map.set(
        billTextChangesMapKey(row.congress, row.bill_type, row.bill_number),
        { ...row, bill_type: normalizeBillType(row.bill_type) }
      );
    }
  }
  return map;
}

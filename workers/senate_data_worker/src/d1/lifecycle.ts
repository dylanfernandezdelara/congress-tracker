import type { BillLawKind } from "../../../../shared/lifecycle-api-types";
import { normalizeBillType } from "../sources/bill-type";
import { ensureSchema } from "./schema";

export interface LifecycleRow {
  congress: number;
  bill_type: string;
  bill_number: number;
  introduced_date: string | null;
  presented_date: string | null;
  signed_date: string | null;
  vetoed_date: string | null;
  became_law_date: string | null;
  law_kind: BillLawKind | null;
  public_law: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  updated_at: string;
}

export interface UpsertLifecycleParams {
  congress: number;
  billType: string;
  billNumber: number;
  introducedDate: string | null;
  presentedDate: string | null;
  signedDate: string | null;
  vetoedDate: string | null;
  becameLawDate: string | null;
  lawKind: BillLawKind | null;
  publicLaw: string | null;
  latestActionDate: string | null;
  latestActionText: string | null;
}

export interface LifecycleBillKey {
  congress: number;
  billType: string;
  billNumber: number;
}

function billKey(congress: number, billType: string, billNumber: number): string {
  return `${congress}:${normalizeBillType(billType)}:${billNumber}`;
}

function parseLawKind(value: string | null): BillLawKind | null {
  if (
    value === "signed" ||
    value === "law_unsigned" ||
    value === "enacted_over_veto" ||
    value === "vetoed" ||
    value === "pocket_vetoed"
  ) {
    return value;
  }
  return null;
}

export async function upsertLifecycle(
  db: D1Database,
  params: UpsertLifecycleParams
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO bill_lifecycle (
        congress, bill_type, bill_number,
        introduced_date, presented_date, signed_date, vetoed_date, became_law_date,
        law_kind, public_law, latest_action_date, latest_action_text, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(congress, bill_type, bill_number) DO UPDATE SET
        introduced_date = COALESCE(excluded.introduced_date, bill_lifecycle.introduced_date),
        presented_date = COALESCE(excluded.presented_date, bill_lifecycle.presented_date),
        signed_date = COALESCE(excluded.signed_date, bill_lifecycle.signed_date),
        vetoed_date = COALESCE(excluded.vetoed_date, bill_lifecycle.vetoed_date),
        became_law_date = COALESCE(excluded.became_law_date, bill_lifecycle.became_law_date),
        law_kind = COALESCE(excluded.law_kind, bill_lifecycle.law_kind),
        public_law = COALESCE(excluded.public_law, bill_lifecycle.public_law),
        latest_action_date = COALESCE(excluded.latest_action_date, bill_lifecycle.latest_action_date),
        latest_action_text = COALESCE(excluded.latest_action_text, bill_lifecycle.latest_action_text),
        updated_at = excluded.updated_at`
    )
    .bind(
      params.congress,
      normalizeBillType(params.billType),
      params.billNumber,
      params.introducedDate,
      params.presentedDate,
      params.signedDate,
      params.vetoedDate,
      params.becameLawDate,
      params.lawKind,
      params.publicLaw,
      params.latestActionDate,
      params.latestActionText,
      now
    )
    .run();
}

export async function getLifecycle(
  db: D1Database,
  congress: number,
  billType: string,
  billNumber: number
): Promise<LifecycleRow | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT congress, bill_type, bill_number,
              introduced_date, presented_date, signed_date, vetoed_date, became_law_date,
              law_kind, public_law, latest_action_date, latest_action_text, updated_at
       FROM bill_lifecycle
       WHERE congress = ? AND UPPER(bill_type) = ? AND bill_number = ?`
    )
    .bind(congress, normalizeBillType(billType), billNumber)
    .first<{
      congress: number;
      bill_type: string;
      bill_number: number;
      introduced_date: string | null;
      presented_date: string | null;
      signed_date: string | null;
      vetoed_date: string | null;
      became_law_date: string | null;
      law_kind: string | null;
      public_law: string | null;
      latest_action_date: string | null;
      latest_action_text: string | null;
      updated_at: string;
    }>();

  if (!row) return null;
  return {
    ...row,
    bill_type: normalizeBillType(row.bill_type),
    law_kind: parseLawKind(row.law_kind),
  };
}

/** D1 caps bound parameters; each bill uses 3 binds in the OR tuple query. */
const LIFECYCLE_LOOKUP_CHUNK = 30;

/**
 * Bulk-read lifecycle rows for a set of bills. Keyed by `congress:TYPE:number`.
 */
export async function getLifecyclesForBills(
  db: D1Database,
  bills: LifecycleBillKey[]
): Promise<Map<string, LifecycleRow>> {
  await ensureSchema(db);
  const map = new Map<string, LifecycleRow>();
  if (bills.length === 0) return map;

  const unique = new Map<string, LifecycleBillKey>();
  for (const bill of bills) {
    unique.set(billKey(bill.congress, bill.billType, bill.billNumber), {
      congress: bill.congress,
      billType: normalizeBillType(bill.billType),
      billNumber: bill.billNumber,
    });
  }
  const list = [...unique.values()];

  for (let i = 0; i < list.length; i += LIFECYCLE_LOOKUP_CHUNK) {
    const chunk = list.slice(i, i + LIFECYCLE_LOOKUP_CHUNK);
    const clauses = chunk.map(() => "(congress = ? AND UPPER(bill_type) = ? AND bill_number = ?)").join(" OR ");
    const binds: Array<string | number> = [];
    for (const bill of chunk) {
      binds.push(bill.congress, bill.billType, bill.billNumber);
    }
    const { results } = await db
      .prepare(
        `SELECT congress, bill_type, bill_number,
                introduced_date, presented_date, signed_date, vetoed_date, became_law_date,
                law_kind, public_law, latest_action_date, latest_action_text, updated_at
         FROM bill_lifecycle
         WHERE ${clauses}`
      )
      .bind(...binds)
      .all<{
        congress: number;
        bill_type: string;
        bill_number: number;
        introduced_date: string | null;
        presented_date: string | null;
        signed_date: string | null;
        vetoed_date: string | null;
        became_law_date: string | null;
        law_kind: string | null;
        public_law: string | null;
        latest_action_date: string | null;
        latest_action_text: string | null;
        updated_at: string;
      }>();

    for (const row of results ?? []) {
      const type = normalizeBillType(row.bill_type);
      map.set(billKey(row.congress, type, row.bill_number), {
        ...row,
        bill_type: type,
        law_kind: parseLawKind(row.law_kind),
      });
    }
  }

  return map;
}

export function lifecycleMapKey(
  congress: number,
  billType: string,
  billNumber: number
): string {
  return billKey(congress, billType, billNumber);
}

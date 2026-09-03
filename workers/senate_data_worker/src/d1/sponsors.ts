import type { BillRef, BillSponsorRecord } from "../types";
import { billLookupKey, type BillLookupKey } from "./votes";
import { ensureSchema } from "./schema";
import { normalizeBillType } from "../sources/bill-type";

export type { BillSponsorRecord };

export async function billHasSponsors(
  db: D1Database,
  congress: number,
  billType: string,
  billNumber: number
): Promise<boolean> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT 1 AS ok
       FROM bill_sponsors
       WHERE congress = ? AND UPPER(bill_type) = ? AND bill_number = ?
         AND is_primary = 1
       LIMIT 1`
    )
    .bind(congress, normalizeBillType(billType), billNumber)
    .first<{ ok: number }>();
  return row != null;
}

export type SponsorBillKey = BillLookupKey;

const SPONSOR_LOOKUP_CHUNK = 30;

export interface PrimarySponsorRow {
  congress: number;
  bill_type: string;
  bill_number: number;
  bioguide_id: string;
  full_name: string | null;
  party: string | null;
  state: string;
}

/** Primary sponsors for many bills in chunked queries. */
export async function getPrimarySponsorsForBills(
  db: D1Database,
  bills: SponsorBillKey[]
): Promise<Map<string, PrimarySponsorRow>> {
  await ensureSchema(db);
  const map = new Map<string, PrimarySponsorRow>();
  if (bills.length === 0) return map;

  const unique = new Map<string, SponsorBillKey>();
  for (const bill of bills) {
    unique.set(billLookupKey(bill.congress, bill.billType, bill.billNumber), {
      congress: bill.congress,
      billType: normalizeBillType(bill.billType),
      billNumber: bill.billNumber,
    });
  }
  const list = [...unique.values()];

  for (let i = 0; i < list.length; i += SPONSOR_LOOKUP_CHUNK) {
    const chunk = list.slice(i, i + SPONSOR_LOOKUP_CHUNK);
    const clauses = chunk
      .map(() => "(s.congress = ? AND UPPER(s.bill_type) = ? AND s.bill_number = ?)")
      .join(" OR ");
    const binds: Array<string | number> = [];
    for (const bill of chunk) {
      binds.push(bill.congress, bill.billType, bill.billNumber);
    }
    const { results } = await db
      .prepare(
        `SELECT s.congress, s.bill_type, s.bill_number, s.bioguide_id,
                s.full_name, s.party, s.state
         FROM bill_sponsors s
         WHERE s.is_primary = 1 AND (${clauses})`
      )
      .bind(...binds)
      .all<PrimarySponsorRow>();

    for (const row of results ?? []) {
      map.set(billLookupKey(row.congress, row.bill_type, row.bill_number), row);
    }
  }
  return map;
}

/**
 * Replace stored primary sponsors for a bill.
 * No-ops when `sponsors` is empty so a transient empty Congress.gov parse cannot
 * wipe good rows (and leave the bill stuck in perpetual backfill).
 */
export async function replaceBillSponsors(
  db: D1Database,
  bill: BillRef,
  sponsors: BillSponsorRecord[]
): Promise<void> {
  if (sponsors.length === 0) return;

  await ensureSchema(db);
  const type = normalizeBillType(bill.type);
  const now = new Date().toISOString();

  const statements = [
    db
      .prepare(
        `DELETE FROM bill_sponsors
         WHERE congress = ? AND UPPER(bill_type) = ? AND bill_number = ?`
      )
      .bind(bill.congress, type, bill.number),
    ...sponsors.map((sponsor) =>
      db
        .prepare(
          `INSERT INTO bill_sponsors (
            congress, bill_type, bill_number, bioguide_id,
            state, full_name, party, is_primary, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          bill.congress,
          type,
          bill.number,
          sponsor.bioguideId,
          sponsor.state,
          sponsor.fullName,
          sponsor.party,
          sponsor.isPrimary ? 1 : 0,
          now
        )
    ),
  ];
  await db.batch(statements);
}

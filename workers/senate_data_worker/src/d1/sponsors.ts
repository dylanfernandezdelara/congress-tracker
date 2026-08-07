import type { BillRef, BillSponsorRecord } from "../types";
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

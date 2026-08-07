import { ensureSchema } from "./schema";
import { normalizeBillType } from "../sources/bill-type";

export interface BillSponsorRecord {
  bioguideId: string;
  state: string;
  fullName: string | null;
  party: string | null;
  /** Primary sponsor when true; reserved for future cosponsor support. */
  isPrimary: boolean;
}

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
       LIMIT 1`
    )
    .bind(congress, normalizeBillType(billType), billNumber)
    .first<{ ok: number }>();
  return row != null;
}

/**
 * Replace all stored sponsors for a bill. Callers pass the full primary-sponsor
 * list from Congress.gov so stale rows are cleared when membership changes.
 */
export async function replaceBillSponsors(
  db: D1Database,
  congress: number,
  billType: string,
  billNumber: number,
  sponsors: BillSponsorRecord[]
): Promise<void> {
  await ensureSchema(db);
  const type = normalizeBillType(billType);
  const now = new Date().toISOString();

  await db
    .prepare(
      `DELETE FROM bill_sponsors
       WHERE congress = ? AND UPPER(bill_type) = ? AND bill_number = ?`
    )
    .bind(congress, type, billNumber)
    .run();

  if (sponsors.length === 0) return;

  const statements = sponsors.map((sponsor) =>
    db
      .prepare(
        `INSERT INTO bill_sponsors (
          congress, bill_type, bill_number, bioguide_id,
          state, full_name, party, is_primary, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        congress,
        type,
        billNumber,
        sponsor.bioguideId,
        sponsor.state,
        sponsor.fullName,
        sponsor.party,
        sponsor.isPrimary ? 1 : 0,
        now
      )
  );
  await db.batch(statements);
}

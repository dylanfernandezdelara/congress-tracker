import type { BillSectionBody } from "../sources/bill-text";
import { normalizeBillType } from "../sources/bill-type";
import { ensureSchema } from "./schema";

export interface BillTextDocumentRow {
  congress: number;
  bill_type: string;
  bill_number: number;
  text_version: string | null;
  text_version_date: string | null;
  section_count: number;
  checked_at: string;
  fetched_at: string | null;
}

export interface BillTextSectionRow extends BillSectionBody {
  ordinal: number;
}

export type BillTextKey = { congress: number; billType: string; billNumber: number };

export function billTextMapKey(congress: number, billType: string, billNumber: number): string {
  return `${congress}:${normalizeBillType(billType)}:${billNumber}`;
}

/** D1 caps bound parameters; each bill uses 3 binds in the OR tuple query. */
const LOOKUP_CHUNK = 30;
/** Rows per `db.batch` insert chunk (well under D1's statement/bind limits). */
const INSERT_CHUNK = 50;

export async function getBillTextDocumentsForBills(
  db: D1Database,
  bills: BillTextKey[]
): Promise<Map<string, BillTextDocumentRow>> {
  await ensureSchema(db);
  const map = new Map<string, BillTextDocumentRow>();
  if (bills.length === 0) return map;

  const unique = new Map<string, BillTextKey>();
  for (const bill of bills) {
    unique.set(billTextMapKey(bill.congress, bill.billType, bill.billNumber), {
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
    for (const bill of chunk) binds.push(bill.congress, bill.billType, bill.billNumber);
    const { results } = await db
      .prepare(
        `SELECT congress, bill_type, bill_number, text_version, text_version_date,
                section_count, checked_at, fetched_at
         FROM bill_text_documents
         WHERE ${clauses}`
      )
      .bind(...binds)
      .all<BillTextDocumentRow>();
    for (const row of results ?? []) {
      map.set(billTextMapKey(row.congress, row.bill_type, row.bill_number), row);
    }
  }
  return map;
}

/** Record a probe that found the stored print still current. */
export async function touchBillTextDocumentCheckedAt(
  db: D1Database,
  key: BillTextKey
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `UPDATE bill_text_documents SET checked_at = ?
       WHERE congress = ? AND bill_type = ? AND bill_number = ?`
    )
    .bind(new Date().toISOString(), key.congress, normalizeBillType(key.billType), key.billNumber)
    .run();
}

/**
 * Record a probe for a bill that has no XML text yet (or whose print is too
 * large to store) so the daily run does not re-probe it until tomorrow.
 */
export async function upsertBillTextDocumentProbe(
  db: D1Database,
  key: BillTextKey,
  version: { type: string; date: string } | null
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO bill_text_documents (
         congress, bill_type, bill_number, text_version, text_version_date,
         section_count, checked_at, fetched_at
       ) VALUES (?, ?, ?, ?, ?, 0, ?, NULL)
       ON CONFLICT(congress, bill_type, bill_number) DO UPDATE SET
         checked_at = excluded.checked_at`
    )
    .bind(
      key.congress,
      normalizeBillType(key.billType),
      key.billNumber,
      version?.type ?? null,
      version?.date ?? null,
      new Date().toISOString()
    )
    .run();
}

/**
 * Replace a bill's stored sections with a newly parsed print. Delete + insert
 * run in one batch so a reader never sees a half-written document.
 */
export async function replaceBillTextSections(
  db: D1Database,
  key: BillTextKey,
  version: { type: string; date: string },
  sections: BillSectionBody[]
): Promise<void> {
  await ensureSchema(db);
  const congress = key.congress;
  const billType = normalizeBillType(key.billType);
  const billNumber = key.billNumber;
  const now = new Date().toISOString();

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `DELETE FROM bill_text_sections
         WHERE congress = ? AND bill_type = ? AND bill_number = ?`
      )
      .bind(congress, billType, billNumber),
  ];
  for (let i = 0; i < sections.length; i += INSERT_CHUNK) {
    const chunk = sections.slice(i, i + INSERT_CHUNK);
    const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const binds: Array<string | number> = [];
    chunk.forEach((section, offset) => {
      binds.push(
        congress,
        billType,
        billNumber,
        i + offset,
        section.label,
        section.heading,
        section.body
      );
    });
    statements.push(
      db
        .prepare(
          `INSERT INTO bill_text_sections
             (congress, bill_type, bill_number, ordinal, label, heading, body)
           VALUES ${values}`
        )
        .bind(...binds)
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO bill_text_documents (
           congress, bill_type, bill_number, text_version, text_version_date,
           section_count, checked_at, fetched_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(congress, bill_type, bill_number) DO UPDATE SET
           text_version = excluded.text_version,
           text_version_date = excluded.text_version_date,
           section_count = excluded.section_count,
           checked_at = excluded.checked_at,
           fetched_at = excluded.fetched_at`
      )
      .bind(congress, billType, billNumber, version.type, version.date, sections.length, now, now)
  );
  await db.batch(statements);
}

export interface StoredBillText {
  document: BillTextDocumentRow;
  sections: BillTextSectionRow[];
}

/** Stored print + sections for one bill, or null when nothing was ingested yet. */
export async function getBillText(
  db: D1Database,
  bill: { congress: number; type: string; number: number }
): Promise<StoredBillText | null> {
  await ensureSchema(db);
  const billType = normalizeBillType(bill.type);
  const document = await db
    .prepare(
      `SELECT congress, bill_type, bill_number, text_version, text_version_date,
              section_count, checked_at, fetched_at
       FROM bill_text_documents
       WHERE congress = ? AND bill_type = ? AND bill_number = ?`
    )
    .bind(bill.congress, billType, bill.number)
    .first<BillTextDocumentRow>();
  if (!document || !document.fetched_at) return null;
  const { results } = await db
    .prepare(
      `SELECT ordinal, label, heading, body
       FROM bill_text_sections
       WHERE congress = ? AND bill_type = ? AND bill_number = ?
       ORDER BY ordinal`
    )
    .bind(bill.congress, billType, bill.number)
    .all<BillTextSectionRow>();
  return { document, sections: results ?? [] };
}

import type { BillDigestContent } from "../../../../shared/digest-api-types";
import { ensureSchema } from "./schema";
import { normalizeBillType } from "../sources/bill-type";

export type { BillDigestContent };

export function parseStoredDigest(json: string | null): BillDigestContent | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as BillDigestContent;
    if (!parsed.headline || !parsed.what_it_does) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface DigestRow {
  congress: number;
  bill_type: string;
  number: number;
  title: string | null;
  policy_area: string | null;
  raw_summary_text: string | null;
  digest_json: string | null;
}

export async function upsertDigest(
  db: D1Database,
  params: {
    congress: number;
    billType: string;
    number: number;
    title: string | null;
    policyArea: string | null;
    rawSummaryText: string | null;
    digest: BillDigestContent | null;
    /** When digest is null, keep this JSON instead of tombstoning the row. */
    preserveDigestJson?: string | null;
  }
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const digestJson = params.digest
    ? JSON.stringify(params.digest)
    : (params.preserveDigestJson ?? null);
  await db
    .prepare(
      `INSERT INTO bill_digests (
        congress, bill_type, number, title, policy_area,
        raw_summary_text, digest_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(congress, bill_type, number) DO UPDATE SET
        title = excluded.title,
        policy_area = excluded.policy_area,
        raw_summary_text = excluded.raw_summary_text,
        digest_json = excluded.digest_json,
        updated_at = excluded.updated_at`
    )
    .bind(
      params.congress,
      normalizeBillType(params.billType),
      params.number,
      params.title,
      params.policyArea,
      params.rawSummaryText,
      digestJson,
      now,
      now
    )
    .run();
}

export async function getDigest(
  db: D1Database,
  congress: number,
  billType: string,
  number: number
): Promise<DigestRow | null> {
  await ensureSchema(db);
  return db
    .prepare(
      `SELECT congress, bill_type, number, title, policy_area, raw_summary_text, digest_json
       FROM bill_digests
       WHERE congress = ? AND UPPER(bill_type) = ? AND number = ?`
    )
    .bind(congress, normalizeBillType(billType), number)
    .first<DigestRow>();
}

export type DigestBillKey = {
  congress: number;
  billType: string;
  number: number;
};

export function digestMapKey(congress: number, billType: string, number: number): string {
  return `${congress}:${normalizeBillType(billType)}:${number}`;
}

/** D1 caps bound parameters; each bill uses 3 binds in the OR tuple query. */
const DIGEST_LOOKUP_CHUNK = 30;

/** Bulk-read digests keyed by `congress:TYPE:number`. */
export async function getDigestsForBills(
  db: D1Database,
  bills: DigestBillKey[]
): Promise<Map<string, DigestRow>> {
  await ensureSchema(db);
  const map = new Map<string, DigestRow>();
  if (bills.length === 0) return map;

  const unique = new Map<string, DigestBillKey>();
  for (const bill of bills) {
    unique.set(digestMapKey(bill.congress, bill.billType, bill.number), {
      congress: bill.congress,
      billType: normalizeBillType(bill.billType),
      number: bill.number,
    });
  }
  const list = [...unique.values()];

  for (let i = 0; i < list.length; i += DIGEST_LOOKUP_CHUNK) {
    const chunk = list.slice(i, i + DIGEST_LOOKUP_CHUNK);
    const clauses = chunk
      .map(() => "(congress = ? AND UPPER(bill_type) = ? AND number = ?)")
      .join(" OR ");
    const binds: Array<string | number> = [];
    for (const bill of chunk) {
      binds.push(bill.congress, bill.billType, bill.number);
    }
    const { results } = await db
      .prepare(
        `SELECT congress, bill_type, number, title, policy_area, raw_summary_text, digest_json
         FROM bill_digests
         WHERE ${clauses}`
      )
      .bind(...binds)
      .all<DigestRow>();

    for (const row of results ?? []) {
      map.set(digestMapKey(row.congress, row.bill_type, row.number), {
        ...row,
        bill_type: normalizeBillType(row.bill_type),
      });
    }
  }
  return map;
}

export async function selectDigestBillRefs(
  db: D1Database,
  congress: number,
  limit = 250
): Promise<Array<{ congress: number; type: string; number: number }>> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT congress, bill_type, number
       FROM bill_digests
       WHERE congress = ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .bind(congress, limit)
    .all<{ congress: number; bill_type: string; number: number }>();
  return (results ?? []).map((row) => ({
    congress: row.congress,
    type: normalizeBillType(row.bill_type),
    number: row.number,
  }));
}

import type { BillDigestContent } from "../types";
import { ensureSchema } from "./schema";

export interface DigestRow {
  congress: number;
  bill_type: string;
  number: number;
  title: string | null;
  policy_area: string | null;
  raw_summary_text: string | null;
  digest_json: string | null;
}

export async function digestExists(
  db: D1Database,
  congress: number,
  billType: string,
  number: number
): Promise<boolean> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT 1 FROM bill_digests WHERE congress = ? AND bill_type = ? AND number = ? LIMIT 1`
    )
    .bind(congress, billType, number)
    .first();
  return row != null;
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
  }
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  const digestJson = params.digest ? JSON.stringify(params.digest) : null;
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
      params.billType,
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
       FROM bill_digests WHERE congress = ? AND bill_type = ? AND number = ?`
    )
    .bind(congress, billType, number)
    .first<DigestRow>();
}

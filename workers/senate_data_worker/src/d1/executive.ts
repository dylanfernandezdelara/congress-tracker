import type {
  ExecutiveBillLink,
  ExecutiveBillRole,
  ExecutiveSignal,
} from "../../../../shared/executive-api-types";
import { ensureSchema } from "./schema";
import { normalizeBillType } from "../sources/bill-type";

const EXECUTIVE_POST_PUBLIC_COLUMNS =
  "id, platform, author, text, posted_at, source_url, archive_url, summary, ingested_at";

const EXECUTIVE_POST_PUBLIC_COLUMNS_QUALIFIED =
  "p.id, p.platform, p.author, p.text, p.posted_at, p.source_url, p.archive_url, p.summary, p.ingested_at";

const EXECUTIVE_POST_ALL_COLUMNS = `${EXECUTIVE_POST_PUBLIC_COLUMNS}, raw_json`;

export interface ExecutivePostRow {
  id: string;
  platform: string;
  author: string;
  text: string;
  posted_at: string;
  source_url: string;
  archive_url: string | null;
  summary: string | null;
  raw_json: string | null;
  ingested_at: string;
}

export interface ExecutivePostBillRow {
  post_id: string;
  bill_congress: number;
  bill_type: string;
  bill_number: number;
  link_method: string;
  role: string;
  confidence: number;
  rationale: string | null;
  is_primary: number;
}

export interface UpsertExecutivePostParams {
  id: string;
  platform: string;
  author: string;
  text: string;
  postedAt: string;
  sourceUrl: string;
  archiveUrl: string | null;
  summary: string | null;
  rawJson: string | null;
}

export async function getExecutivePost(
  db: D1Database,
  id: string
): Promise<ExecutivePostRow | null> {
  await ensureSchema(db);
  return db
    .prepare(`SELECT ${EXECUTIVE_POST_ALL_COLUMNS} FROM executive_posts WHERE id = ?`)
    .bind(id)
    .first<ExecutivePostRow>();
}

export async function upsertExecutivePost(
  db: D1Database,
  params: UpsertExecutivePostParams
): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO executive_posts (
        id, platform, author, text, posted_at, source_url, archive_url,
        summary, raw_json, ingested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        text = excluded.text,
        posted_at = excluded.posted_at,
        source_url = excluded.source_url,
        archive_url = excluded.archive_url,
        summary = excluded.summary,
        raw_json = excluded.raw_json,
        ingested_at = excluded.ingested_at`
    )
    .bind(
      params.id,
      params.platform,
      params.author,
      params.text,
      params.postedAt,
      params.sourceUrl,
      params.archiveUrl,
      params.summary,
      params.rawJson,
      now
    )
    .run();
}

export async function replaceExecutivePostBills(
  db: D1Database,
  postId: string,
  links: Array<{
    billCongress: number;
    billType: string;
    billNumber: number;
    linkMethod: string;
    role: ExecutiveBillRole;
    confidence: number;
    rationale: string | null;
    isPrimary: boolean;
  }>
): Promise<void> {
  await ensureSchema(db);
  const deleteStmt = db.prepare(`DELETE FROM executive_post_bills WHERE post_id = ?`).bind(postId);
  const insertStmt = db.prepare(
    `INSERT INTO executive_post_bills (
      post_id, bill_congress, bill_type, bill_number,
      link_method, role, confidence, rationale, is_primary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const batch = [
    deleteStmt,
    ...links.map((link) =>
      insertStmt.bind(
        postId,
        link.billCongress,
        normalizeBillType(link.billType),
        link.billNumber,
        link.linkMethod,
        link.role,
        link.confidence,
        link.rationale,
        link.isPrimary ? 1 : 0
      )
    ),
  ];
  await db.batch(batch);
}

export async function listRecentExecutiveAlerts(
  db: D1Database,
  sinceIso: string,
  limit: number
): Promise<ExecutivePostRow[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT ${EXECUTIVE_POST_PUBLIC_COLUMNS}
       FROM executive_posts
       WHERE posted_at >= ?
       ORDER BY posted_at DESC
       LIMIT ?`
    )
    .bind(sinceIso, limit)
    .all<ExecutivePostRow>();
  return results ?? [];
}

export async function getExecutivePostBillsForPost(
  db: D1Database,
  postId: string
): Promise<ExecutivePostBillRow[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(`SELECT * FROM executive_post_bills WHERE post_id = ? ORDER BY is_primary DESC, confidence DESC`)
    .bind(postId)
    .all<ExecutivePostBillRow>();
  return results ?? [];
}

export async function getExecutivePostBillsForBill(
  db: D1Database,
  congress: number,
  billType: string,
  billNumber: number,
  sinceIso: string
): Promise<Array<ExecutivePostRow & { role: string; rationale: string | null }>> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT ${EXECUTIVE_POST_PUBLIC_COLUMNS_QUALIFIED}, b.role, b.rationale
       FROM executive_post_bills b
       JOIN executive_posts p ON p.id = b.post_id
       WHERE b.bill_congress = ? AND UPPER(b.bill_type) = ? AND b.bill_number = ?
         AND p.posted_at >= ?
       ORDER BY p.posted_at DESC`
    )
    .bind(congress, normalizeBillType(billType), billNumber, sinceIso)
    .all<ExecutivePostRow & { role: string; rationale: string | null }>();
  return results ?? [];
}

export async function selectExecutiveBoostedBills(
  db: D1Database,
  sinceIso: string
): Promise<Array<{ bill_congress: number; bill_type: string; bill_number: number; latest_signal_date: string }>> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT b.bill_congress, b.bill_type, b.bill_number, MAX(p.posted_at) AS latest_signal_date
       FROM executive_post_bills b
       JOIN executive_posts p ON p.id = b.post_id
       WHERE p.posted_at >= ?
       GROUP BY b.bill_congress, b.bill_type, b.bill_number`
    )
    .bind(sinceIso)
    .all<{ bill_congress: number; bill_type: string; bill_number: number; latest_signal_date: string }>();
  return results ?? [];
}

export function toExecutiveSignal(row: ExecutivePostRow): ExecutiveSignal {
  const quote = resolveExecutiveQuoteText(row);
  return {
    post_id: row.id,
    posted_at: row.posted_at,
    summary: row.summary ?? quote.slice(0, 160),
    quote,
    source_url: row.source_url,
    archive_url: row.archive_url,
    informal: true,
  };
}

function resolveExecutiveQuoteText(row: ExecutivePostRow): string {
  const text = row.text?.trim();
  if (text) return text;

  if (row.raw_json) {
    try {
      const parsed = JSON.parse(row.raw_json) as { text?: string };
      const fromJson = parsed.text?.trim();
      if (fromJson) return fromJson;
    } catch {
      /* ignore malformed raw_json */
    }
  }

  return row.summary?.trim() ?? "";
}

export function toExecutiveBillLink(
  row: ExecutivePostBillRow,
  title: string | null,
  headline: string | null = null
): ExecutiveBillLink {
  return {
    congress: row.bill_congress,
    type: row.bill_type,
    number: row.bill_number,
    title,
    headline,
    role: row.role as ExecutiveBillRole,
    confidence: row.confidence,
    rationale: row.rationale ?? undefined,
  };
}

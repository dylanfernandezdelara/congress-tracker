import type { BillQuote, BillQuoteSource } from "../../../../shared/share-api-types";
import { normalizeForQuoteMatch } from "../../../../shared/quote-verification";
import { normalizeBillType } from "../sources/bill-type";
import { ensureSchema } from "./schema";

/** Hex chars kept from the SHA-256 digest; 16 hex = 64 bits, plenty for idempotent ids. */
const QUOTE_ID_HEX_CHARS = 16;

const QUOTE_SOURCES: ReadonlySet<string> = new Set<BillQuoteSource>([
  "digest",
  "crs",
  "bill_text",
  "answer",
]);

export function isBillQuoteSource(value: string): value is BillQuoteSource {
  return QUOTE_SOURCES.has(value);
}

/** Loose id syntax check so lookups reject garbage before touching D1. */
export function isBillQuoteId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{8,32}$/.test(value);
}

/**
 * Content-derived id: same bill + same (match-normalized) text → same id.
 * Case and whitespace differences in the selection collapse to one quote.
 */
export async function buildBillQuoteId(
  bill: { congress: number; type: string; number: number },
  text: string
): Promise<string> {
  const input = `${bill.congress}:${normalizeBillType(bill.type)}:${bill.number}\n${normalizeForQuoteMatch(text)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, QUOTE_ID_HEX_CHARS);
}

interface BillQuoteRow {
  id: string;
  congress: number;
  bill_type: string;
  number: number;
  text: string;
  source: string;
  created_at: string;
}

function mapRow(row: BillQuoteRow): BillQuote {
  return {
    id: row.id,
    bill: { congress: row.congress, type: normalizeBillType(row.bill_type), number: row.number },
    text: row.text,
    source: isBillQuoteSource(row.source) ? row.source : "digest",
    created_at: row.created_at,
  };
}

/** Idempotent insert; returns the stored row (existing wins on id collision). */
export async function insertBillQuote(
  db: D1Database,
  params: {
    id: string;
    bill: { congress: number; type: string; number: number };
    text: string;
    source: BillQuoteSource;
  }
): Promise<BillQuote> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO bill_quotes (id, congress, bill_type, number, text, source, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(id) DO NOTHING`
    )
    .bind(
      params.id,
      params.bill.congress,
      normalizeBillType(params.bill.type),
      params.bill.number,
      params.text,
      params.source,
      now
    )
    .run();
  const stored = await getBillQuote(db, params.id);
  return (
    stored ?? {
      id: params.id,
      bill: {
        congress: params.bill.congress,
        type: normalizeBillType(params.bill.type),
        number: params.bill.number,
      },
      text: params.text,
      source: params.source,
      created_at: now,
    }
  );
}

export async function getBillQuote(db: D1Database, id: string): Promise<BillQuote | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT id, congress, bill_type, number, text, source, created_at
       FROM bill_quotes
       WHERE id = ?1`
    )
    .bind(id)
    .first<BillQuoteRow>();
  return row ? mapRow(row) : null;
}

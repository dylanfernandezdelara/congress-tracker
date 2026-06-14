import type { PortfolioEntry, PortfolioMovers } from "../types";
import { ensureSchema } from "./schema";
import { getMember } from "./members";

const DISCLAIMER =
  "Estimates from public STOCK Act disclosures; amounts are reported in ranges and filings may lag by weeks.";

export interface FinancialTransaction {
  bioguideId: string;
  ticker: string | null;
  assetDescription: string | null;
  transactionType: string;
  amountMin: number | null;
  amountMax: number | null;
  transactionDate: string;
  filedDate: string;
}

export async function insertFinancialTransaction(
  db: D1Database,
  tx: FinancialTransaction
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO financial_transactions
        (bioguide_id, ticker, asset_description, transaction_type, amount_min, amount_max, transaction_date, filed_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      tx.bioguideId,
      tx.ticker,
      tx.assetDescription,
      tx.transactionType,
      tx.amountMin,
      tx.amountMax,
      tx.transactionDate,
      tx.filedDate
    )
    .run();
}

export async function upsertPortfolioSnapshot(
  db: D1Database,
  bioguideId: string,
  asOfDate: string,
  sessionReturnPct: number,
  estimatedValueUsd: number | null = null
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO portfolio_snapshots (bioguide_id, as_of_date, estimated_value_usd, session_return_pct)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(bioguide_id, as_of_date) DO UPDATE SET
         estimated_value_usd = excluded.estimated_value_usd,
         session_return_pct = excluded.session_return_pct`
    )
    .bind(bioguideId, asOfDate, estimatedValueUsd, sessionReturnPct)
    .run();
}

interface SnapshotRow {
  bioguide_id: string;
  session_return_pct: number;
  as_of_date: string;
}

export async function buildPortfolioMovers(
  db: D1Database,
  chamber: string,
  limit: number
): Promise<PortfolioMovers> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT ps.bioguide_id, ps.session_return_pct, ps.as_of_date
       FROM portfolio_snapshots ps
       JOIN members m ON m.bioguide_id = ps.bioguide_id
       WHERE m.chamber = ?
       ORDER BY ps.as_of_date DESC`
    )
    .bind(chamber)
    .all<SnapshotRow>();

  const latestByMember = new Map<string, SnapshotRow>();
  for (const row of results ?? []) {
    if (!latestByMember.has(row.bioguide_id)) {
      latestByMember.set(row.bioguide_id, row);
    }
  }

  const entries: PortfolioEntry[] = [];
  for (const row of latestByMember.values()) {
    const member = await getMember(db, row.bioguide_id);
    entries.push({
      bioguide_id: row.bioguide_id,
      name: member?.name ?? row.bioguide_id,
      party: member?.party ?? null,
      state: member?.state ?? null,
      session_return_pct: row.session_return_pct,
      as_of_date: row.as_of_date,
    });
  }

  const sorted = [...entries].sort((a, b) => b.session_return_pct - a.session_return_pct);
  const gainers = sorted.filter((e) => e.session_return_pct > 0).slice(0, limit);
  const losers = [...sorted]
    .filter((e) => e.session_return_pct < 0)
    .sort((a, b) => a.session_return_pct - b.session_return_pct)
    .slice(0, limit);

  return { gainers, losers, disclaimer: DISCLAIMER };
}

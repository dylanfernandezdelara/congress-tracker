import type { Chamber, PortfolioEntry, PortfolioMovers } from "../types";
import { hasRealMemberRoster } from "./members";
import { ensureSchema } from "./schema";

const DISCLAIMER =
  "Estimates from public STOCK Act disclosures; amounts are reported in ranges and filings may lag by weeks.";

const SAMPLE_DISCLAIMER =
  "Local sample portfolio estimates for development only; not real disclosure data.";

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
  name: string;
  party: string | null;
  state: string | null;
  session_return_pct: number;
  as_of_date: string;
}

export async function buildPortfolioMovers(
  db: D1Database,
  chamber: Chamber,
  limit: number
): Promise<PortfolioMovers> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT ps.bioguide_id, m.name, m.party, m.state, ps.session_return_pct, ps.as_of_date
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

  const entries: PortfolioEntry[] = [...latestByMember.values()].map((row) => ({
    bioguide_id: row.bioguide_id,
    name: row.name,
    party: row.party,
    state: row.state,
    session_return_pct: row.session_return_pct,
    as_of_date: row.as_of_date,
  }));

  const sorted = [...entries].sort((a, b) => b.session_return_pct - a.session_return_pct);
  const realRoster = await hasRealMemberRoster(db);
  const visibleEntries = realRoster
    ? entries.filter((entry) => !entry.bioguide_id.startsWith("LOCAL:"))
    : entries;

  const gainers = [...visibleEntries]
    .filter((e) => e.session_return_pct > 0)
    .sort((a, b) => b.session_return_pct - a.session_return_pct)
    .slice(0, limit);
  const losers = [...visibleEntries]
    .filter((e) => e.session_return_pct < 0)
    .sort((a, b) => a.session_return_pct - b.session_return_pct)
    .slice(0, limit);

  const hasSampleOnly =
    visibleEntries.length > 0 &&
    visibleEntries.every((entry) => entry.bioguide_id.startsWith("LOCAL:"));

  return {
    gainers,
    losers,
    disclaimer: hasSampleOnly ? SAMPLE_DISCLAIMER : DISCLAIMER,
  };
}

export async function clearSampleDisclosureRows(db: D1Database): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(`DELETE FROM financial_transactions WHERE bioguide_id LIKE 'LOCAL:%'`)
    .run();
  await db
    .prepare(`DELETE FROM portfolio_snapshots WHERE bioguide_id LIKE 'LOCAL:%'`)
    .run();
}

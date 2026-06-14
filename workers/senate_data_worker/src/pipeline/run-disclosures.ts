import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import {
  insertFinancialTransaction,
  upsertPortfolioSnapshot,
} from "../d1/disclosures";
import { upsertMember } from "../d1/members";

/** Synthetic disclosure rows for dev until PTR ingestion is wired. Never use real bioguide IDs. */
const SAMPLE_DISCLOSURES = [
  {
    bioguideId: "LOCAL:S001",
    name: "Sample Senator A (local disclosure)",
    chamber: "Senate" as const,
    party: "D",
    state: "MA",
    ticker: "MSFT",
    transactionType: "purchase",
    amountMin: 1000,
    amountMax: 15000,
    returnPct: 12.4,
  },
  {
    bioguideId: "LOCAL:S002",
    name: "Sample Senator B (local disclosure)",
    chamber: "Senate" as const,
    party: "R",
    state: "FL",
    ticker: "XOM",
    transactionType: "sale",
    amountMin: 15000,
    amountMax: 50000,
    returnPct: -8.2,
  },
  {
    bioguideId: "LOCAL:H001",
    name: "Sample Representative A (local disclosure)",
    chamber: "House" as const,
    party: "D",
    state: "CA",
    ticker: "NVDA",
    transactionType: "purchase",
    amountMin: 50000,
    amountMax: 100000,
    returnPct: 18.6,
  },
  {
    bioguideId: "LOCAL:H002",
    name: "Sample Representative B (local disclosure)",
    chamber: "House" as const,
    party: "R",
    state: "SC",
    ticker: "BA",
    transactionType: "sale",
    amountMin: 1000,
    amountMax: 15000,
    returnPct: -4.1,
  },
];

export interface RunDisclosuresResult {
  membersSeeded: number;
  transactionsInserted: number;
  snapshotsUpserted: number;
}

export async function runDisclosuresPipeline(env: Env): Promise<RunDisclosuresResult> {
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const asOf = new Date().toISOString().slice(0, 10);
  let membersSeeded = 0;
  let transactionsInserted = 0;
  let snapshotsUpserted = 0;

  for (const sample of SAMPLE_DISCLOSURES) {
    await upsertMember(env.DB, {
      bioguideId: sample.bioguideId,
      name: sample.name,
      chamber: sample.chamber,
      party: sample.party,
      state: sample.state,
      district: null,
    });
    membersSeeded += 1;

    await insertFinancialTransaction(env.DB, {
      bioguideId: sample.bioguideId,
      ticker: sample.ticker,
      assetDescription: `${sample.ticker} common stock`,
      transactionType: sample.transactionType,
      amountMin: sample.amountMin,
      amountMax: sample.amountMax,
      transactionDate: `${congress}-${session}-sample`,
      filedDate: asOf,
    });
    transactionsInserted += 1;

    await upsertPortfolioSnapshot(env.DB, sample.bioguideId, asOf, sample.returnPct);
    snapshotsUpserted += 1;
  }

  return { membersSeeded, transactionsInserted, snapshotsUpserted };
}

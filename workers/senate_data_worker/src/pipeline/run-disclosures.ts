import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import {
  clearSampleDisclosureRows,
  insertFinancialTransaction,
  upsertPortfolioSnapshot,
} from "../d1/disclosures";
import { upsertMember } from "../d1/members";

/** Matches LOCAL:* portfolio movers in scripts/seed-local-feed.sh — never use real bioguide IDs. */
const SAMPLE_DISCLOSURES = [
  {
    bioguideId: "LOCAL:H003",
    name: "Rep. Portfolio Gainer (local)",
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
    bioguideId: "LOCAL:H004",
    name: "Rep. Portfolio Loser (local)",
    chamber: "House" as const,
    party: "R",
    state: "SC",
    ticker: "BA",
    transactionType: "sale",
    amountMin: 1000,
    amountMax: 15000,
    returnPct: -4.1,
  },
  {
    bioguideId: "LOCAL:S001",
    name: "Sen. Sample Crossover (local)",
    chamber: "Senate" as const,
    party: "R",
    state: "TX",
    ticker: "MSFT",
    transactionType: "purchase",
    amountMin: 1000,
    amountMax: 15000,
    returnPct: 6.2,
  },
  {
    bioguideId: "LOCAL:S002",
    name: "Sen. Sample Loyal (local)",
    chamber: "Senate" as const,
    party: "R",
    state: "TX",
    ticker: "XOM",
    transactionType: "sale",
    amountMin: 15000,
    amountMax: 50000,
    returnPct: -2.5,
  },
];

export interface RunDisclosuresResult {
  membersSeeded: number;
  transactionsInserted: number;
  snapshotsUpserted: number;
}

function isSampleDisclosuresEnabled(env: Env): boolean {
  const flag = env.ENABLE_SAMPLE_DISCLOSURES?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export async function runDisclosuresPipeline(env: Env): Promise<RunDisclosuresResult> {
  if (!isSampleDisclosuresEnabled(env)) {
    throw new Error(
      "Synthetic disclosures pipeline is disabled (set ENABLE_SAMPLE_DISCLOSURES=1 in .dev.vars for local dev only)"
    );
  }
  if (env.ALLOWED_ORIGIN?.trim() !== "*") {
    throw new Error(
      "Synthetic disclosures pipeline is local-dev only (set ALLOWED_ORIGIN=* in .dev.vars)"
    );
  }

  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const asOf = new Date().toISOString().slice(0, 10);
  let membersSeeded = 0;
  let transactionsInserted = 0;
  let snapshotsUpserted = 0;

  await clearSampleDisclosureRows(env.DB);

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

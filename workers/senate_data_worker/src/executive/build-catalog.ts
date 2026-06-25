import type { ExecutiveCatalogBill } from "../../../../shared/executive-api-types";
import { congressNumber } from "../config";
import type { Env } from "../config";
import { getDigest, parseStoredDigest } from "../d1/digests";
import { selectExecutiveBoostedBills } from "../d1/executive";
import { selectRecentVotedBills } from "../d1/votes";
import { lookbackStartIso } from "../sources/congress-client";
import { VOTE_LOOKBACK_DAYS } from "../constants";
import type { BillRef } from "../types";
import { billRefKey, buildExecutiveCatalogEntry } from "./guardrails";

/** Known off-feed bills Trump frequently references — merged into catalog before LLM proposes new ones. */
export const EXECUTIVE_SEED_BILLS: BillRef[] = [{ congress: 119, type: "HR", number: 22 }];

export async function buildExecutiveCandidateCatalog(env: Env): Promise<ExecutiveCatalogBill[]> {
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const feedBills = await selectRecentVotedBills(env.DB, lookback, 100, 0);
  const boosted = await selectExecutiveBoostedBills(
    env.DB,
    lookbackStartIso(365)
  );

  const keys = new Map<string, BillRef>();
  for (const row of feedBills) {
    keys.set(
      billRefKey({
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      }),
      {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      }
    );
  }
  for (const row of boosted) {
    keys.set(
      billRefKey({
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      }),
      {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      }
    );
  }
  for (const seed of EXECUTIVE_SEED_BILLS) {
    if (seed.congress === congressNumber(env)) keys.set(billRefKey(seed), seed);
  }

  const catalog: ExecutiveCatalogBill[] = [];
  for (const bill of keys.values()) {
    const digestRow = await getDigest(env.DB, bill.congress, bill.type, bill.number);
    const digest = parseStoredDigest(digestRow?.digest_json ?? null);
    catalog.push(
      buildExecutiveCatalogEntry(
        bill,
        digestRow?.title ?? null,
        digest?.headline ?? null,
        digestRow?.policy_area ?? null
      )
    );
  }
  return catalog;
}

export async function ensureBillInCatalog(
  env: Env,
  bill: BillRef,
  catalog: ExecutiveCatalogBill[]
): Promise<ExecutiveCatalogBill[]> {
  if (catalog.some((entry) => billRefKey(entry) === billRefKey(bill))) return catalog;
  const digestRow = await getDigest(env.DB, bill.congress, bill.type, bill.number);
  const digest = parseStoredDigest(digestRow?.digest_json ?? null);
  return [
    ...catalog,
    buildExecutiveCatalogEntry(
      bill,
      digestRow?.title ?? null,
      digest?.headline ?? null,
      digestRow?.policy_area ?? null
    ),
  ];
}

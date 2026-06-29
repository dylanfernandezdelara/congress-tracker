import type { ExecutiveCatalogBill } from "../../../../shared/executive-api-types";
import { congressNumber } from "../config";
import type { Env } from "../config";
import { getDigest, parseStoredDigest, selectDigestBillRefs } from "../d1/digests";
import { selectExecutiveBoostedBills } from "../d1/executive";
import { selectRecentVotedBills } from "../d1/votes";
import { lookbackStartIso } from "../sources/congress-client";
import { normalizeBillType } from "../sources/bill-type";
import { VOTE_LOOKBACK_DAYS } from "../constants";
import type { BillRef } from "../types";
import { billRefKey, buildExecutiveCatalogEntry } from "./guardrails";

export async function buildExecutiveCandidateCatalog(env: Env): Promise<ExecutiveCatalogBill[]> {
  const congress = congressNumber(env);
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const [feedBills, digestBills, boosted] = await Promise.all([
    selectRecentVotedBills(env.DB, lookback, 100, 0),
    selectDigestBillRefs(env.DB, congress, 250),
    selectExecutiveBoostedBills(env.DB, lookbackStartIso(365)),
  ]);

  const keys = new Map<string, BillRef>();
  const addBill = (bill: BillRef) => {
    if (bill.congress !== congress) return;
    keys.set(billRefKey(bill), {
      congress: bill.congress,
      type: normalizeBillType(bill.type),
      number: bill.number,
    });
  };

  for (const row of feedBills) {
    addBill({
      congress: row.bill_congress,
      type: row.bill_type,
      number: row.bill_number,
    });
  }
  for (const bill of digestBills) addBill(bill);
  for (const row of boosted) {
    addBill({
      congress: row.bill_congress,
      type: row.bill_type,
      number: row.bill_number,
    });
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
  const normalized = {
    congress: bill.congress,
    type: normalizeBillType(bill.type),
    number: bill.number,
  };
  if (catalog.some((entry) => billRefKey(entry) === billRefKey(normalized))) return catalog;
  const digestRow = await getDigest(env.DB, normalized.congress, normalized.type, normalized.number);
  const digest = parseStoredDigest(digestRow?.digest_json ?? null);
  return [
    ...catalog,
    buildExecutiveCatalogEntry(
      normalized,
      digestRow?.title ?? null,
      digest?.headline ?? null,
      digestRow?.policy_area ?? null
    ),
  ];
}

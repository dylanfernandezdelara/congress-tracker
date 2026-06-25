import type { Env } from "../config";
import { getDigest } from "../d1/digests";
import { upsertDigest } from "../d1/digests";
import { fetchBillSummaryBundle } from "../sources/congress-client";
import { rewriteSummary } from "../synthesis/openrouter";
import { formatBillDocket } from "../../../../shared/feed-content";
import type { BillRef } from "../types";

export async function hydrateBillFromCongress(env: Env, bill: BillRef): Promise<boolean> {
  const existing = await getDigest(env.DB, bill.congress, bill.type, bill.number);
  if (existing?.title && existing.raw_summary_text) return true;

  if (!env.CONGRESS_API_KEY?.trim()) return false;

  const bundle = await fetchBillSummaryBundle(env, bill);
  let digest = null;
  if (env.OPENROUTER_API_KEY?.trim() && bundle.rawSummaryText) {
    digest = await rewriteSummary(env, {
      title: bundle.title,
      billLabel: formatBillDocket(bill.type, bill.number, bill.congress),
      policyArea: bundle.policyArea,
      rawSummary: bundle.rawSummaryText,
    });
  }

  await upsertDigest(env.DB, {
    congress: bill.congress,
    billType: bill.type,
    number: bill.number,
    title: bundle.title,
    policyArea: bundle.policyArea,
    rawSummaryText: bundle.rawSummaryText,
    digest,
  });
  return true;
}

import type { Env } from "../config";
import { getDigest, parseStoredDigest, upsertDigest } from "../d1/digests";
import { billHasSponsors, replaceBillSponsors } from "../d1/sponsors";
import { fetchBillSummaryBundle } from "../sources/congress-client";
import { rewriteSummary } from "../synthesis/openrouter";
import { formatBillDocket } from "../../../../shared/feed-content";
import { ingestPassageVotesForBill } from "./ingest-bill-passage-votes";
import type { BillRef } from "../types";

async function fetchAndPersistSponsors(env: Env, bill: BillRef): Promise<Awaited<
  ReturnType<typeof fetchBillSummaryBundle>
> | null> {
  if (!env.CONGRESS_API_KEY?.trim()) return null;
  const bundle = await fetchBillSummaryBundle(env, bill);
  await replaceBillSponsors(env.DB, bill, bundle.sponsors);
  return bundle;
}

export async function hydrateBillFromCongress(env: Env, bill: BillRef): Promise<boolean> {
  const existing = await getDigest(env.DB, bill.congress, bill.type, bill.number);
  if (parseStoredDigest(existing?.digest_json ?? null)) {
    if (!(await billHasSponsors(env.DB, bill.congress, bill.type, bill.number))) {
      await fetchAndPersistSponsors(env, bill);
    }
    await ingestPassageVotesForBill(env, bill);
    return true;
  }

  const bundle = await fetchAndPersistSponsors(env, bill);
  if (!bundle) return false;

  let digest = null;
  if (env.OPENROUTER_API_KEY?.trim()) {
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

  if (bundle.title?.trim()) {
    await ingestPassageVotesForBill(env, bill);
    return true;
  }
  return false;
}

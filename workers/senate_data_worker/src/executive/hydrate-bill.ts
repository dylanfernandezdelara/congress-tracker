import type { Env } from "../config";
import { enqueueDigestJobs } from "../d1/digest-jobs";
import { getDigest, parseStoredDigest, upsertDigest, wantsSummary } from "../d1/digests";
import { billHasSponsors, replaceBillSponsors } from "../d1/sponsors";
import { fetchBillSummaryBundle } from "../sources/congress-client";
import { buildTitleFallbackDigest } from "../synthesis/title-fallback-digest";
import { ingestPassageVotesForBill } from "./ingest-bill-passage-votes";
import type { BillRef } from "../types";

/**
 * A bill named in an executive post: sponsors, passage votes, a title fallback when it has no summary yet, and a
 * rewrite in the summary queue (a bill the White House talks about matters). Returns false when Congress.gov has
 * no title for it.
 */
export async function hydrateBillFromCongress(env: Env, bill: BillRef): Promise<boolean> {
  const existing = await getDigest(env.DB, bill.congress, bill.type, bill.number);
  const hasSummary = Boolean(parseStoredDigest(existing?.digest_json ?? null));
  let hasTitle = Boolean(existing?.title?.trim());

  if (!hasSummary || !(await billHasSponsors(env.DB, bill.congress, bill.type, bill.number))) {
    if (!env.CONGRESS_API_KEY?.trim()) return hasSummary;
    const bundle = await fetchBillSummaryBundle(env, bill);
    await replaceBillSponsors(env.DB, bill, bundle.sponsors);
    hasTitle = Boolean(bundle.title?.trim());
    if (!hasSummary) {
      await upsertDigest(env.DB, {
        congress: bill.congress,
        billType: bill.type,
        number: bill.number,
        title: bundle.title,
        policyArea: bundle.policyArea,
        rawSummaryText: bundle.rawSummaryText,
        digest: buildTitleFallbackDigest({ title: bundle.title, rawSummary: bundle.rawSummaryText }),
      });
    }
  }
  if (!hasSummary && !hasTitle) return false;
  if (wantsSummary(existing?.digest_json ?? null, "rewrite")) await enqueueDigestJobs(env.DB, [bill], "rewrite");
  await ingestPassageVotesForBill(env, bill);
  return true;
}

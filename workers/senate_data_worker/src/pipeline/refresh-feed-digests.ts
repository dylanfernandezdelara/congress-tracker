import type { Env } from "../config";
import { enqueueDigestJobs } from "../d1/digest-jobs";
import {
  digestMapKey,
  getDigest,
  getDigestsForBills,
  parseStoredDigest,
  upsertDigest,
  wantsSummary,
  type DigestRow,
} from "../d1/digests";
import type { LifecycleBillRow } from "../d1/lifecycle";
import { billHasSponsors, replaceBillSponsors } from "../d1/sponsors";
import { fetchBillSummaryBundle } from "../sources/congress-client";
import { buildTitleFallbackDigest } from "../synthesis/title-fallback-digest";
import type { BillRef } from "../types";
import { billLabel } from "./bill-label";

export interface RefreshFeedDigestsResult {
  /** Rows written now: title fallbacks for bills with no summary yet. */
  written: number;
  skipped: number;
  /** Bills queued for a plain-language summary (written by the hourly sweep). */
  queued: number;
  warnings: string[];
}

export interface RefreshFeedDigestsOptions {
  /** Bills in the first `/feed/latest` page: they matter, so they are queued for a rewrite. */
  prioritize?: Iterable<LifecycleBillRow>;
}

const toRef = (row: LifecycleBillRow): BillRef => ({ congress: row.bill_congress, type: row.bill_type, number: row.bill_number });

async function loadDigestMap(env: Env, bills: LifecycleBillRow[], warnings: string[]): Promise<Map<string, DigestRow> | null> {
  try {
    return await getDigestsForBills(
      env.DB,
      bills.map((row) => ({ congress: row.bill_congress, billType: row.bill_type, number: row.bill_number }))
    );
  } catch (err) {
    warnings.push(`bulk digest lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Feed bills: store sponsors, give a bill with no summary its title fallback right away (so the feed never shows a
 * hole), and queue each bill that lacks a current summary. The hourly sweep writes the summaries (digest/write.ts);
 * feed-window bills are queued as rewrites.
 */
export async function refreshFeedDigests(
  env: Env,
  bills: LifecycleBillRow[],
  options: RefreshFeedDigestsOptions = {}
): Promise<RefreshFeedDigestsResult> {
  const result: RefreshFeedDigestsResult = { written: 0, skipped: 0, queued: 0, warnings: [] };
  const priority = new Set([...(options.prioritize ?? [])].map((r) => digestMapKey(r.bill_congress, r.bill_type, r.bill_number)));
  const digests = await loadDigestMap(env, bills, result.warnings);
  const queue: Record<"new" | "rewrite", BillRef[]> = { new: [], rewrite: [] };

  for (const row of bills) {
    const ref = toRef(row);
    const key = digestMapKey(row.bill_congress, row.bill_type, row.bill_number);
    const label = billLabel(row.bill_type, row.bill_number, row.bill_congress);
    try {
      const existing = digests ? (digests.get(key) ?? null) : await getDigest(env.DB, ref.congress, ref.type, ref.number);
      const hasSummary = Boolean(parseStoredDigest(existing?.digest_json ?? null));
      if (!hasSummary || !(await billHasSponsors(env.DB, ref.congress, ref.type, ref.number))) {
        const bundle = await fetchBillSummaryBundle(env, ref);
        await replaceBillSponsors(env.DB, ref, bundle.sponsors);
        if (!hasSummary) {
          await upsertDigest(env.DB, {
            congress: ref.congress,
            billType: ref.type,
            number: ref.number,
            title: bundle.title,
            policyArea: bundle.policyArea,
            rawSummaryText: bundle.rawSummaryText,
            digest: buildTitleFallbackDigest({ title: bundle.title, rawSummary: bundle.rawSummaryText }),
          });
          result.written += 1;
        }
      }
      const tier = priority.has(key) ? "rewrite" : "new";
      if (wantsSummary(existing?.digest_json ?? null, tier)) {
        queue[tier].push(ref);
        result.queued += 1;
      } else {
        result.skipped += 1;
      }
    } catch (err) {
      result.warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await enqueueDigestJobs(env.DB, queue.rewrite, "rewrite");
  await enqueueDigestJobs(env.DB, queue.new, "new");
  return result;
}

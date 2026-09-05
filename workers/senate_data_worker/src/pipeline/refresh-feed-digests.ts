import { DIGEST_MAX_NEW_REWRITES } from "../constants";
import type { Env } from "../config";
import {
  digestMapKey,
  getDigestsForBills,
  parseStoredDigest,
  upsertDigest,
  type DigestRow,
} from "../d1/digests";
import type { LifecycleBillRow } from "../d1/lifecycle";
import { billHasSponsors, replaceBillSponsors } from "../d1/sponsors";
import { fetchBillSummaryBundle } from "../sources/congress-client";
import { rewriteSummary } from "../synthesis/openrouter";
import { billLabel } from "./bill-label";

export interface RefreshFeedDigestsResult {
  written: number;
  skipped: number;
  rewritten: number;
  warnings: string[];
}

function existingFor(
  digestByKey: Map<string, DigestRow>,
  row: LifecycleBillRow
): DigestRow | null {
  return digestByKey.get(digestMapKey(row.bill_congress, row.bill_type, row.bill_number)) ?? null;
}

/**
 * Fill missing feed digests first (CRS when present, otherwise title),
 * then backfill sponsors on rows that already have a complete digest.
 * Incomplete work consumes DIGEST_MAX_NEW_REWRITES before any complete-row I/O.
 */
export async function refreshFeedDigests(
  env: Env,
  bills: LifecycleBillRow[],
  model: string
): Promise<RefreshFeedDigestsResult> {
  let written = 0;
  let skipped = 0;
  let rewritten = 0;
  let newRewrites = 0;
  const warnings: string[] = [];

  const digestByKey = await getDigestsForBills(
    env.DB,
    bills.map((row) => ({
      congress: row.bill_congress,
      billType: row.bill_type,
      number: row.bill_number,
    }))
  );

  const incomplete: LifecycleBillRow[] = [];
  const complete: LifecycleBillRow[] = [];
  for (const row of bills) {
    if (parseStoredDigest(existingFor(digestByKey, row)?.digest_json ?? null)) {
      complete.push(row);
    } else {
      incomplete.push(row);
    }
  }

  for (const row of incomplete) {
    try {
      const existing = existingFor(digestByKey, row);
      const billRef = {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      };
      const bundle = await fetchBillSummaryBundle(env, billRef);
      await replaceBillSponsors(env.DB, billRef, bundle.sponsors);

      const metadataChanged =
        !existing?.raw_summary_text ||
        existing.title !== bundle.title ||
        existing.policy_area !== bundle.policyArea;

      const canRewrite = newRewrites < DIGEST_MAX_NEW_REWRITES;
      if (!canRewrite) {
        if (metadataChanged) {
          await upsertDigest(env.DB, {
            congress: row.bill_congress,
            billType: row.bill_type,
            number: row.bill_number,
            title: bundle.title,
            policyArea: bundle.policyArea,
            rawSummaryText: bundle.rawSummaryText,
            digest: null,
            preserveDigestJson: existing?.digest_json ?? null,
          });
          written += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      const digest = await rewriteSummary(
        env,
        {
          title: bundle.title,
          billLabel: billLabel(row.bill_type, row.bill_number, row.bill_congress),
          policyArea: bundle.policyArea,
          rawSummary: bundle.rawSummaryText,
        },
        model
      );

      if (digest === null && !metadataChanged) {
        skipped += 1;
        continue;
      }

      await upsertDigest(env.DB, {
        congress: row.bill_congress,
        billType: row.bill_type,
        number: row.bill_number,
        title: bundle.title,
        policyArea: bundle.policyArea,
        rawSummaryText: bundle.rawSummaryText,
        digest,
        preserveDigestJson: digest === null ? existing?.digest_json ?? null : null,
      });
      written += 1;

      if (digest !== null) {
        rewritten += 1;
        newRewrites += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(
        `${billLabel(row.bill_type, row.bill_number, row.bill_congress)}: ${message}`
      );
    }
  }

  for (const row of complete) {
    try {
      const hasSponsors = await billHasSponsors(
        env.DB,
        row.bill_congress,
        row.bill_type,
        row.bill_number
      );
      if (hasSponsors) {
        skipped += 1;
        continue;
      }
      const bundle = await fetchBillSummaryBundle(env, {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      });
      await replaceBillSponsors(env.DB, {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      }, bundle.sponsors);
      skipped += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(
        `${billLabel(row.bill_type, row.bill_number, row.bill_congress)}: ${message}`
      );
    }
  }

  return { written, skipped, rewritten, warnings };
}

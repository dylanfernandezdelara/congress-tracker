import type { Env } from "../config";
import { classifyDigestPhase, getDigest, upsertDigest } from "../d1/digests";
import { billHasSponsors, replaceBillSponsors } from "../d1/sponsors";
import { fetchBillSummaryBundle, type BillSummaryBundle } from "../sources/congress-client";
import { rewriteSummary } from "../synthesis/openrouter";
import { buildTitleFallbackDigest } from "../synthesis/title-fallback-digest";
import { formatBillDocket } from "../../../../shared/feed-content";
import { ingestPassageVotesForBill } from "./ingest-bill-passage-votes";
import type { BillRef } from "../types";

async function fetchAndPersistSponsors(env: Env, bill: BillRef): Promise<BillSummaryBundle | null> {
  if (!env.CONGRESS_API_KEY?.trim()) return null;
  const bundle = await fetchBillSummaryBundle(env, bill);
  await replaceBillSponsors(env.DB, bill, bundle.sponsors);
  return bundle;
}

async function rewriteFromBundle(env: Env, bill: BillRef, bundle: BillSummaryBundle) {
  if (!env.OPENROUTER_API_KEY?.trim()) return null;
  return rewriteSummary(env, {
    title: bundle.title,
    billLabel: formatBillDocket(bill.type, bill.number, bill.congress),
    policyArea: bundle.policyArea,
    rawSummary: bundle.rawSummaryText,
  });
}

export async function hydrateBillFromCongress(env: Env, bill: BillRef): Promise<boolean> {
  const existing = await getDigest(env.DB, bill.congress, bill.type, bill.number);
  const phase = classifyDigestPhase(existing);
  if (phase === "complete") {
    if (!(await billHasSponsors(env.DB, bill.congress, bill.type, bill.number))) {
      await fetchAndPersistSponsors(env, bill);
    }
    await ingestPassageVotesForBill(env, bill);
    return true;
  }

  const bundle = await fetchAndPersistSponsors(env, bill);
  if (!bundle) return false;

  switch (phase) {
    case "crs_upgrade": {
      if (bundle.rawSummaryText?.trim()) {
        const digest = await rewriteFromBundle(env, bill, bundle);
        if (digest) {
          await upsertDigest(env.DB, { ...billDigestKey(bill), ...bundleFields(bundle), digest });
        }
      }
      await ingestPassageVotesForBill(env, bill);
      return true;
    }
    case "fallback_upgrade": {
      // Same as the feed refresh: replace with the LLM digest, else refresh the
      // fallback only when Congress.gov metadata (title / policy / CRS) moved.
      const metadataChanged =
        existing?.title !== bundle.title ||
        existing?.policy_area !== bundle.policyArea ||
        (existing?.raw_summary_text ?? null) !== (bundle.rawSummaryText ?? null);
      const digest =
        (await rewriteFromBundle(env, bill, bundle)) ??
        (metadataChanged
          ? buildTitleFallbackDigest({ title: bundle.title, rawSummary: bundle.rawSummaryText })
          : null);
      if (digest) {
        await upsertDigest(env.DB, { ...billDigestKey(bill), ...bundleFields(bundle), digest });
      }
      await ingestPassageVotesForBill(env, bill);
      return true;
    }
    case "incomplete": {
      // Same miss policy as the daily feed refresh: a rewrite miss stores a
      // deterministic title fallback instead of a NULL digest_json tombstone.
      let digest = await rewriteFromBundle(env, bill, bundle);
      if (!digest) {
        digest = buildTitleFallbackDigest({ title: bundle.title, rawSummary: bundle.rawSummaryText });
        console.warn(
          JSON.stringify({
            event: digest
              ? "executive_bill_digest_title_fallback"
              : "executive_bill_digest_unavailable",
            bill: formatBillDocket(bill.type, bill.number, bill.congress),
          })
        );
      }
      await upsertDigest(env.DB, { ...billDigestKey(bill), ...bundleFields(bundle), digest });
      if (bundle.title?.trim()) {
        await ingestPassageVotesForBill(env, bill);
        return true;
      }
      return false;
    }
    default: {
      const unreachable: never = phase;
      throw new Error(`unknown digest phase: ${String(unreachable)}`);
    }
  }
}

function billDigestKey(bill: BillRef) {
  return { congress: bill.congress, billType: bill.type, number: bill.number };
}

function bundleFields(bundle: BillSummaryBundle) {
  return {
    title: bundle.title,
    policyArea: bundle.policyArea,
    rawSummaryText: bundle.rawSummaryText,
  };
}

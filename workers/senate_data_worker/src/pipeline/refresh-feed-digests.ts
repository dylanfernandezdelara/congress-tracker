import { DIGEST_MAX_NEW_REWRITES } from "../constants";
import type { Env } from "../config";
import {
  digestMapKey,
  getDigest,
  getDigestsForBills,
  needsCrsUpgrade,
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

interface DigestLookup {
  map: Map<string, DigestRow>;
  /** Bills whose digest row could not be read; never treat as incomplete. */
  untrustedKeys: Set<string>;
}

type DigestPhase = "incomplete" | "crs_upgrade" | "complete";

interface DigestWorkItem {
  row: LifecycleBillRow;
  phase: DigestPhase;
}

interface DigestCounters {
  written: number;
  skipped: number;
  rewritten: number;
  newRewrites: number;
}

async function loadDigestMap(
  env: Env,
  bills: LifecycleBillRow[],
  warnings: string[]
): Promise<DigestLookup> {
  try {
    return {
      map: await getDigestsForBills(
        env.DB,
        bills.map((row) => ({
          congress: row.bill_congress,
          billType: row.bill_type,
          number: row.bill_number,
        }))
      ),
      untrustedKeys: new Set(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`bulk digest lookup failed: ${message}`);
    const map = new Map<string, DigestRow>();
    const untrustedKeys = new Set<string>();
    for (const row of bills) {
      const key = digestMapKey(row.bill_congress, row.bill_type, row.bill_number);
      try {
        const existing = await getDigest(
          env.DB,
          row.bill_congress,
          row.bill_type,
          row.bill_number
        );
        if (existing) {
          map.set(key, existing);
        }
      } catch (rowErr) {
        untrustedKeys.add(key);
        const rowMessage = rowErr instanceof Error ? rowErr.message : String(rowErr);
        warnings.push(
          `${billLabel(row.bill_type, row.bill_number, row.bill_congress)}: ${rowMessage}`
        );
      }
    }
    return { map, untrustedKeys };
  }
}

export interface RefreshFeedDigestsOptions {
  /**
   * Bills in the first `/feed/latest` page (same window as
   * `getMissingDigestCount`). Incomplete rows here consume
   * `DIGEST_MAX_NEW_REWRITES` before other incompletes so older
   * passage votes cannot starve visible executive/intro holes.
   */
  prioritize?: Iterable<LifecycleBillRow>;
}

async function processBill(
  env: Env,
  model: string,
  item: DigestWorkItem,
  existing: DigestRow | null,
  counters: DigestCounters,
  warnings: string[]
): Promise<void> {
  const { row, phase } = item;
  try {
    if (phase === "complete") {
      const hasSponsors = await billHasSponsors(
        env.DB,
        row.bill_congress,
        row.bill_type,
        row.bill_number
      );
      if (!hasSponsors) {
        const bundle = await fetchBillSummaryBundle(env, {
          congress: row.bill_congress,
          type: row.bill_type,
          number: row.bill_number,
        });
        await replaceBillSponsors(
          env.DB,
          {
            congress: row.bill_congress,
            type: row.bill_type,
            number: row.bill_number,
          },
          bundle.sponsors
        );
      }
      counters.skipped += 1;
      return;
    }

    const billRef = {
      congress: row.bill_congress,
      type: row.bill_type,
      number: row.bill_number,
    };
    const bundle = await fetchBillSummaryBundle(env, billRef);
    await replaceBillSponsors(env.DB, billRef, bundle.sponsors);

    if (phase === "crs_upgrade") {
      if (!bundle.rawSummaryText?.trim() || counters.newRewrites >= DIGEST_MAX_NEW_REWRITES) {
        counters.skipped += 1;
        return;
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
      if (!digest) {
        counters.skipped += 1;
        return;
      }
      await upsertDigest(env.DB, {
        congress: row.bill_congress,
        billType: row.bill_type,
        number: row.bill_number,
        title: bundle.title,
        policyArea: bundle.policyArea,
        rawSummaryText: bundle.rawSummaryText,
        digest,
      });
      counters.written += 1;
      counters.rewritten += 1;
      counters.newRewrites += 1;
      return;
    }

    const metadataChanged =
      !existing?.raw_summary_text ||
      existing.title !== bundle.title ||
      existing.policy_area !== bundle.policyArea;

    if (counters.newRewrites >= DIGEST_MAX_NEW_REWRITES) {
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
        counters.written += 1;
      } else {
        counters.skipped += 1;
      }
      return;
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
      counters.skipped += 1;
      return;
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
    counters.written += 1;
    if (digest !== null) {
      counters.rewritten += 1;
      counters.newRewrites += 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${billLabel(row.bill_type, row.bill_number, row.bill_congress)}: ${message}`);
  }
}

/**
 * Fill missing feed digests first (CRS when present, otherwise title),
 * then upgrade title-only rows when CRS arrives, then sponsor-backfill
 * complete CRS-backed rows. Incomplete work consumes DIGEST_MAX_NEW_REWRITES
 * before optional CRS upgrades. Feed-window incompletes (see `prioritize`)
 * spend that budget before non-visible voted bills.
 */
export async function refreshFeedDigests(
  env: Env,
  bills: LifecycleBillRow[],
  model: string,
  options: RefreshFeedDigestsOptions = {}
): Promise<RefreshFeedDigestsResult> {
  const counters: DigestCounters = {
    written: 0,
    skipped: 0,
    rewritten: 0,
    newRewrites: 0,
  };
  const warnings: string[] = [];
  const priorityKeys = new Set(
    [...(options.prioritize ?? [])].map((row) =>
      digestMapKey(row.bill_congress, row.bill_type, row.bill_number)
    )
  );

  const { map: digestByKey, untrustedKeys } = await loadDigestMap(env, bills, warnings);

  const incompletePriority: DigestWorkItem[] = [];
  const incompleteRest: DigestWorkItem[] = [];
  const crsUpgrade: DigestWorkItem[] = [];
  const complete: DigestWorkItem[] = [];
  for (const row of bills) {
    const key = digestMapKey(row.bill_congress, row.bill_type, row.bill_number);
    if (untrustedKeys.has(key)) {
      counters.skipped += 1;
      continue;
    }
    const existing = existingFor(digestByKey, row);
    if (!parseStoredDigest(existing?.digest_json ?? null)) {
      const item: DigestWorkItem = { row, phase: "incomplete" };
      if (priorityKeys.has(key)) {
        incompletePriority.push(item);
      } else {
        incompleteRest.push(item);
      }
    } else if (needsCrsUpgrade(existing)) {
      crsUpgrade.push({ row, phase: "crs_upgrade" });
    } else {
      complete.push({ row, phase: "complete" });
    }
  }

  for (const item of [...incompletePriority, ...incompleteRest, ...crsUpgrade, ...complete]) {
    await processBill(env, model, item, existingFor(digestByKey, item.row), counters, warnings);
  }

  return {
    written: counters.written,
    skipped: counters.skipped,
    rewritten: counters.rewritten,
    warnings,
  };
}

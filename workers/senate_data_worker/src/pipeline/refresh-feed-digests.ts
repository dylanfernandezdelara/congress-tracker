import { DIGEST_MAX_NEW_REWRITES } from "../constants";
import type { Env } from "../config";
import {
  classifyDigestPhase,
  digestMapKey,
  getDigest,
  getDigestsForBills,
  hasDigestRewriteSource,
  upsertDigest,
  type DigestPhase,
  type DigestRow,
  type StoredBillDigest,
} from "../d1/digests";
import type { LifecycleBillRow } from "../d1/lifecycle";
import { billHasSponsors, replaceBillSponsors } from "../d1/sponsors";
import {
  fetchBillSummaryBundle,
  type BillSummaryBundle,
} from "../sources/congress-client";
import { rewriteSummary } from "../synthesis/openrouter";
import { buildTitleFallbackDigest } from "../synthesis/title-fallback-digest";
import type { BillDigestContent } from "../types";
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

interface DigestWorkItem {
  row: LifecycleBillRow;
  phase: DigestPhase;
}

interface DigestCounters {
  written: number;
  skipped: number;
  rewritten: number;
  newRewrites: number;
  /** Title fallbacks written because DIGEST_MAX_NEW_REWRITES was already spent. */
  budgetFallbacks: number;
}

interface BillDigestContext {
  env: Env;
  model: string;
  row: LifecycleBillRow;
  label: string;
  bundle: BillSummaryBundle;
  existing: DigestRow | null;
  counters: DigestCounters;
  warnings: string[];
}

function bundleMetadataChanged(existing: DigestRow | null, bundle: BillSummaryBundle): boolean {
  return (
    !existing ||
    existing.title !== bundle.title ||
    existing.policy_area !== bundle.policyArea ||
    (existing.raw_summary_text ?? null) !== (bundle.rawSummaryText ?? null)
  );
}

async function rewriteFromBundle(ctx: BillDigestContext): Promise<BillDigestContent | null> {
  return rewriteSummary(
    ctx.env,
    {
      title: ctx.bundle.title,
      billLabel: ctx.label,
      policyArea: ctx.bundle.policyArea,
      rawSummary: ctx.bundle.rawSummaryText,
    },
    ctx.model
  );
}

async function writeDigest(
  ctx: BillDigestContext,
  digest: BillDigestContent | null,
  preserveDigestJson: string | null = null
): Promise<void> {
  await upsertDigest(ctx.env.DB, {
    congress: ctx.row.bill_congress,
    billType: ctx.row.bill_type,
    number: ctx.row.bill_number,
    title: ctx.bundle.title,
    policyArea: ctx.bundle.policyArea,
    rawSummaryText: ctx.bundle.rawSummaryText,
    digest,
    preserveDigestJson,
  });
  ctx.counters.written += 1;
}

async function writeRewrite(ctx: BillDigestContext, digest: BillDigestContent): Promise<void> {
  await writeDigest(ctx, digest);
  ctx.counters.rewritten += 1;
  ctx.counters.newRewrites += 1;
}

/** Deterministic digest so the bill leaves `missing_digest_count`. */
function titleFallbackFor(bundle: BillSummaryBundle): StoredBillDigest | null {
  return buildTitleFallbackDigest({ title: bundle.title, rawSummary: bundle.rawSummaryText });
}

async function writeEmptyDigestRow(ctx: BillDigestContext, detail: string): Promise<void> {
  ctx.warnings.push(`${ctx.label}: ${detail}; digest left empty`);
  if (bundleMetadataChanged(ctx.existing, ctx.bundle)) {
    await writeDigest(ctx, null, ctx.existing?.digest_json ?? null);
  } else {
    ctx.counters.skipped += 1;
  }
}

async function processIncomplete(ctx: BillDigestContext): Promise<void> {
  const { bundle, counters } = ctx;
  if (!hasDigestRewriteSource({ title: bundle.title, rawSummary: bundle.rawSummaryText })) {
    await writeEmptyDigestRow(ctx, "no title or CRS summary from Congress.gov");
    return;
  }

  const budgetSpent = counters.newRewrites >= DIGEST_MAX_NEW_REWRITES;
  if (!budgetSpent) {
    const digest = await rewriteFromBundle(ctx);
    if (digest) {
      await writeRewrite(ctx, digest);
      return;
    }
  }

  const fallback = titleFallbackFor(bundle);
  if (!fallback) {
    await writeEmptyDigestRow(ctx, "title fallback digest unavailable");
    return;
  }
  await writeDigest(ctx, fallback);
  if (budgetSpent) {
    counters.budgetFallbacks += 1;
  } else {
    ctx.warnings.push(
      `${ctx.label}: OpenRouter rewrite returned no digest; wrote deterministic title fallback digest`
    );
  }
}

async function processFallbackUpgrade(ctx: BillDigestContext): Promise<void> {
  const { bundle, existing, counters } = ctx;
  if (counters.newRewrites >= DIGEST_MAX_NEW_REWRITES) {
    counters.skipped += 1;
    return;
  }

  const digest = await rewriteFromBundle(ctx);
  if (digest) {
    await writeRewrite(ctx, digest);
    return;
  }

  const detail = "OpenRouter rewrite still returned no digest";
  const refreshed = bundleMetadataChanged(existing, bundle) ? titleFallbackFor(bundle) : null;
  if (refreshed) {
    await writeDigest(ctx, refreshed);
    ctx.warnings.push(`${ctx.label}: ${detail}; wrote deterministic title fallback digest`);
    return;
  }
  counters.skipped += 1;
  ctx.warnings.push(`${ctx.label}: ${detail}; keeping stored title fallback digest`);
}

async function processCrsUpgrade(ctx: BillDigestContext): Promise<void> {
  const { bundle, counters } = ctx;
  if (!bundle.rawSummaryText?.trim() || counters.newRewrites >= DIGEST_MAX_NEW_REWRITES) {
    counters.skipped += 1;
    return;
  }
  const digest = await rewriteFromBundle(ctx);
  if (!digest) {
    counters.skipped += 1;
    ctx.warnings.push(
      `${ctx.label}: OpenRouter CRS rewrite returned no digest; keeping title-only digest`
    );
    return;
  }
  await writeRewrite(ctx, digest);
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
  const label = billLabel(row.bill_type, row.bill_number, row.bill_congress);
  const billRef = {
    congress: row.bill_congress,
    type: row.bill_type,
    number: row.bill_number,
  };
  try {
    if (phase === "complete") {
      const hasSponsors = await billHasSponsors(
        env.DB,
        row.bill_congress,
        row.bill_type,
        row.bill_number
      );
      if (!hasSponsors) {
        const bundle = await fetchBillSummaryBundle(env, billRef);
        await replaceBillSponsors(env.DB, billRef, bundle.sponsors);
      }
      counters.skipped += 1;
      return;
    }

    const bundle = await fetchBillSummaryBundle(env, billRef);
    await replaceBillSponsors(env.DB, billRef, bundle.sponsors);
    const ctx: BillDigestContext = { env, model, row, label, bundle, existing, counters, warnings };

    switch (phase) {
      case "incomplete":
        await processIncomplete(ctx);
        return;
      case "fallback_upgrade":
        await processFallbackUpgrade(ctx);
        return;
      case "crs_upgrade":
        await processCrsUpgrade(ctx);
        return;
      default: {
        const unreachable: never = phase;
        throw new Error(`unknown digest phase: ${String(unreachable)}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`${label}: ${message}`);
  }
}

/**
 * Fill missing feed digests first (CRS when present, otherwise title; a
 * deterministic title fallback when the LLM returns nothing), then retry the
 * LLM for stored title fallbacks, then upgrade LLM title-only rows when CRS
 * arrives, then sponsor-backfill complete CRS-backed rows. Incomplete work
 * consumes DIGEST_MAX_NEW_REWRITES before fallback retries and CRS upgrades.
 * Within each phase, feed-window rows (see `prioritize`) spend that budget
 * before non-visible voted bills.
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
    budgetFallbacks: 0,
  };
  const warnings: string[] = [];
  const priorityKeys = new Set(
    [...(options.prioritize ?? [])].map((row) =>
      digestMapKey(row.bill_congress, row.bill_type, row.bill_number)
    )
  );

  const { map: digestByKey, untrustedKeys } = await loadDigestMap(env, bills, warnings);

  // Feed-window rows (see `prioritize`) lead each rewrite-consuming phase.
  const queues: Record<DigestPhase, { priority: DigestWorkItem[]; rest: DigestWorkItem[] }> = {
    incomplete: { priority: [], rest: [] },
    fallback_upgrade: { priority: [], rest: [] },
    crs_upgrade: { priority: [], rest: [] },
    complete: { priority: [], rest: [] },
  };
  for (const row of bills) {
    const key = digestMapKey(row.bill_congress, row.bill_type, row.bill_number);
    if (untrustedKeys.has(key)) {
      counters.skipped += 1;
      continue;
    }
    const phase = classifyDigestPhase(existingFor(digestByKey, row));
    const queue = queues[phase];
    (priorityKeys.has(key) ? queue.priority : queue.rest).push({ row, phase });
  }

  const ordered: DigestPhase[] = ["incomplete", "fallback_upgrade", "crs_upgrade", "complete"];
  for (const item of ordered.flatMap((phase) => [...queues[phase].priority, ...queues[phase].rest])) {
    await processBill(env, model, item, existingFor(digestByKey, item.row), counters, warnings);
  }

  if (counters.budgetFallbacks > 0) {
    warnings.push(
      `rewrite budget (${DIGEST_MAX_NEW_REWRITES}) spent: wrote deterministic title fallback digest for ${counters.budgetFallbacks} bill(s); LLM retries next run`
    );
  }

  return {
    written: counters.written,
    skipped: counters.skipped,
    rewritten: counters.rewritten,
    warnings,
  };
}

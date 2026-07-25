import { TEXT_CHANGES_MAX_REFRESHES_PER_RUN } from "../constants";
import type { Env } from "../config";
import {
  billTextChangesMapKey,
  getBillTextChangesForBills,
  rowToBillTextChanges,
  touchBillTextChangesCheckedAt,
  upsertBillTextChanges,
  type BillTextChangesRow,
} from "../d1/bill-text-changes";
import {
  compareBillText,
  fetchBillTextChangesSource,
  type BillTextChangesSource,
} from "../sources/bill-text";
import { billLabel } from "./bill-label";

export interface TextChangesBillRow {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
}

export interface RefreshBillTextChangesResult {
  /** Bills whose comparison row was written this run. */
  refreshed: number;
  /** Bills already up to date, or skipped by the per-run cap. */
  skipped: number;
  /** Bills where the newest text adds sections the summary does not describe. */
  withAddedProvisions: number;
  warnings: string[];
}

/**
 * True when a stored row already reflects the current summary and text versions,
 * so the (expensive) XML download can be skipped.
 */
export function isStoredComparisonCurrent(
  stored: BillTextChangesRow | undefined,
  source: BillTextChangesSource
): boolean {
  if (!stored) return false;
  return (
    stored.summary_version_date === (source.summaryVersion?.date ?? null) &&
    stored.summary_version === (source.summaryVersion?.type ?? null) &&
    stored.latest_version_date === (source.latestVersion?.date ?? null) &&
    stored.latest_version === (source.latestVersion?.type ?? null)
  );
}

/**
 * True when a bill was already probed on `today`, so even the two version
 * metadata requests can be skipped. New text versions appear at most daily, and
 * the ingest cron runs daily, so this only suppresses repeat work from manual
 * re-runs — without it every admin run re-probes all 50 feed bills.
 */
export function wasCheckedOn(stored: BillTextChangesRow | undefined, today: string): boolean {
  return stored?.checked_at?.slice(0, 10) === today;
}

/**
 * Detect provisions added to a bill after the version our plain-English summary
 * describes. This is the generic form of a real failure mode: CRS summaries lag
 * floor amendments, so a bill can pass with whole sections the feed never
 * mentions. Bill text is only downloaded when version metadata changed since
 * the last check. Per-bill failures become warnings and never fail the caller.
 */
export async function refreshBillTextChanges(
  env: Env,
  bills: TextChangesBillRow[],
  trigger: string
): Promise<RefreshBillTextChangesResult> {
  let refreshed = 0;
  let skipped = 0;
  let withAddedProvisions = 0;
  const warnings: string[] = [];

  if (!env.CONGRESS_API_KEY?.trim()) {
    return { refreshed, skipped: bills.length, withAddedProvisions, warnings };
  }

  const existing = await getBillTextChangesForBills(
    env.DB,
    bills.map((row) => ({
      congress: row.bill_congress,
      billType: row.bill_type,
      billNumber: row.bill_number,
    }))
  );

  const today = new Date().toISOString().slice(0, 10);

  for (const row of bills) {
    const key = billTextChangesMapKey(row.bill_congress, row.bill_type, row.bill_number);
    const stored = existing.get(key);

    if (refreshed >= TEXT_CHANGES_MAX_REFRESHES_PER_RUN) {
      skipped += 1;
      continue;
    }

    if (stored && wasCheckedOn(stored, today)) {
      if (rowToBillTextChanges(stored) !== null) withAddedProvisions += 1;
      skipped += 1;
      continue;
    }

    const bill = {
      congress: row.bill_congress,
      type: row.bill_type,
      number: row.bill_number,
    };

    try {
      const source = await fetchBillTextChangesSource(env, bill);
      if (stored && isStoredComparisonCurrent(stored, source)) {
        await touchBillTextChangesCheckedAt(env.DB, {
          congress: row.bill_congress,
          billType: row.bill_type,
          billNumber: row.bill_number,
        });
        if (rowToBillTextChanges(stored) !== null) withAddedProvisions += 1;
        skipped += 1;
        continue;
      }

      const changes = await compareBillText(source);
      await upsertBillTextChanges(env.DB, {
        congress: row.bill_congress,
        billType: row.bill_type,
        billNumber: row.bill_number,
        summaryVersion: source.summaryVersion?.type ?? null,
        summaryVersionDate: source.summaryVersion?.date ?? null,
        latestVersion: source.latestVersion?.type ?? null,
        latestVersionDate: source.latestVersion?.date ?? null,
        addedProvisions: changes?.added_provisions ?? [],
        moreAddedCount: changes?.more_added_count ?? 0,
      });
      refreshed += 1;
      if (changes) withAddedProvisions += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const label = billLabel(row.bill_type, row.bill_number, row.bill_congress);
      warnings.push(`${label}: ${message}`);
      console.warn(
        JSON.stringify({
          event: "bill_text_changes_refresh_failed",
          trigger,
          bill: label,
          error: message,
        })
      );
    }
  }

  return { refreshed, skipped, withAddedProvisions, warnings };
}

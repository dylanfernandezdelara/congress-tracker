import { BILL_TEXT_SECTIONS_MAX_FETCHES_PER_RUN } from "../constants";
import type { Env } from "../config";
import {
  billTextMapKey,
  getBillTextDocumentsForBills,
  replaceBillTextSections,
  touchBillTextDocumentCheckedAt,
  upsertBillTextDocumentProbe,
  type BillTextDocumentRow,
} from "../d1/bill-text-sections";
import { fetchBillSectionBodies, fetchLatestBillTextVersion } from "../sources/bill-text";
import { billLabel } from "./bill-label";

export interface TextSectionsBillRow {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
}

export interface RefreshBillTextSectionsResult {
  /** Bills whose sections were (re)written this run. */
  fetched: number;
  /** Bills already current, probed today, or skipped by the per-run cap. */
  skipped: number;
  /** Bills not yet stored after this run (cap bound or no text published). */
  remaining: number;
  warnings: string[];
}

function wasProbedOn(stored: BillTextDocumentRow | undefined, today: string): boolean {
  return stored?.checked_at?.slice(0, 10) === today;
}

function storedPrintMatches(
  stored: BillTextDocumentRow | undefined,
  version: { type: string; date: string }
): boolean {
  return (
    !!stored?.fetched_at &&
    stored.text_version === version.type &&
    stored.text_version_date === version.date
  );
}

/**
 * Keep `bill_text_sections` in step with the newest Congress.gov print for the
 * given bills. Bills with no stored document are served first so a fresh
 * deploy fills the chat corpus before it re-checks bills that already have
 * text. One metadata probe per bill per day; XML is downloaded only when the
 * newest version differs from the stored one. Per-bill failures become
 * warnings and never fail the caller.
 */
export async function refreshBillTextSections(
  env: Env,
  bills: TextSectionsBillRow[],
  trigger: string,
  options: { maxFetches?: number } = {}
): Promise<RefreshBillTextSectionsResult> {
  const maxFetches = options.maxFetches ?? BILL_TEXT_SECTIONS_MAX_FETCHES_PER_RUN;
  const result: RefreshBillTextSectionsResult = {
    fetched: 0,
    skipped: 0,
    remaining: 0,
    warnings: [],
  };
  if (!env.CONGRESS_API_KEY?.trim() || bills.length === 0) {
    result.skipped = bills.length;
    return result;
  }

  const existing = await getBillTextDocumentsForBills(
    env.DB,
    bills.map((row) => ({
      congress: row.bill_congress,
      billType: row.bill_type,
      billNumber: row.bill_number,
    }))
  );
  const today = new Date().toISOString().slice(0, 10);

  const ranked = bills
    .map((row, index) => {
      const stored = existing.get(billTextMapKey(row.bill_congress, row.bill_type, row.bill_number));
      return { row, stored, index, priority: stored?.fetched_at ? 1 : 0 };
    })
    .sort((a, b) => a.priority - b.priority || a.index - b.index);

  let probes = 0;
  for (const { row, stored } of ranked) {
    const key = {
      congress: row.bill_congress,
      billType: row.bill_type,
      billNumber: row.bill_number,
    };
    if (stored && wasProbedOn(stored, today)) {
      result.skipped += 1;
      if (!stored.fetched_at) result.remaining += 1;
      continue;
    }
    if (probes >= maxFetches) {
      result.skipped += 1;
      if (!stored?.fetched_at) result.remaining += 1;
      continue;
    }
    probes += 1;

    const bill = { congress: row.bill_congress, type: row.bill_type, number: row.bill_number };
    const label = billLabel(row.bill_type, row.bill_number, row.bill_congress);
    try {
      const latest = await fetchLatestBillTextVersion(env, bill);
      if (!latest) {
        await upsertBillTextDocumentProbe(env.DB, key, null);
        result.skipped += 1;
        result.remaining += 1;
        continue;
      }
      if (storedPrintMatches(stored, latest)) {
        await touchBillTextDocumentCheckedAt(env.DB, key);
        result.skipped += 1;
        continue;
      }
      const sections = await fetchBillSectionBodies(latest.xmlUrl);
      if (sections === null) {
        await upsertBillTextDocumentProbe(env.DB, key, latest);
        result.warnings.push(`${label}: text version ${latest.type} exceeds the size cap`);
        result.skipped += 1;
        result.remaining += 1;
        continue;
      }
      await replaceBillTextSections(env.DB, key, latest, sections);
      result.fetched += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.warnings.push(`${label}: ${message}`);
      if (!stored?.fetched_at) result.remaining += 1;
      console.warn(
        JSON.stringify({
          event: "bill_text_sections_refresh_failed",
          trigger,
          bill: label,
          error: message,
        })
      );
    }
  }

  return result;
}

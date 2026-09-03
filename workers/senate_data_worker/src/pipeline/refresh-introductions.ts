import type { Env } from "../config";
import { getDigest, upsertDigest } from "../d1/digests";
import { upsertLifecycle, type LifecycleBillRow } from "../d1/lifecycle";
import {
  fetchRecentIntroducedBills,
  type RecentIntroducedBill,
} from "../sources/introduced-bills";
import { billLabel } from "./bill-label";

export interface PersistIntroductionsResult {
  bills: LifecycleBillRow[];
  discovered: number;
  persisted: number;
  warnings: string[];
}

function toBillRow(bill: RecentIntroducedBill): LifecycleBillRow {
  return {
    bill_congress: bill.congress,
    bill_type: bill.type,
    bill_number: bill.number,
  };
}

/**
 * Discover recent Congress.gov introductions and upsert lifecycle + title
 * stubs so the existing digest/sponsor/lifecycle loops can hydrate them.
 */
export async function persistRecentIntroductions(
  env: Env,
  congress: number,
  trigger: string
): Promise<PersistIntroductionsResult> {
  const warnings: string[] = [];
  let listed: RecentIntroducedBill[] = [];

  try {
    listed = await fetchRecentIntroducedBills(env, congress);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(message);
    console.warn(
      JSON.stringify({
        event: "feed_pipeline_intro_list_failed",
        trigger,
        error: message,
      })
    );
    return { bills: [], discovered: 0, persisted: 0, warnings };
  }

  let persisted = 0;
  const bills: LifecycleBillRow[] = [];

  for (const bill of listed) {
    try {
      await upsertLifecycle(env.DB, {
        congress: bill.congress,
        billType: bill.type,
        billNumber: bill.number,
        introducedDate: bill.introducedDate,
        presentedDate: null,
        signedDate: null,
        vetoedDate: null,
        becameLawDate: null,
        lawKind: null,
        publicLaw: null,
        latestActionDate: null,
        latestActionText: null,
      });

      const existing = await getDigest(env.DB, bill.congress, bill.type, bill.number);
      if (!existing && bill.title) {
        await upsertDigest(env.DB, {
          congress: bill.congress,
          billType: bill.type,
          number: bill.number,
          title: bill.title,
          policyArea: null,
          rawSummaryText: null,
          digest: null,
        });
      }

      bills.push(toBillRow(bill));
      persisted += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`${billLabel(bill.type, bill.number, bill.congress)}: ${message}`);
    }
  }

  return { bills, discovered: listed.length, persisted, warnings };
}

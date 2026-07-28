import { LIFECYCLE_MAX_REFRESHES_PER_RUN } from "../constants";
import type { Env } from "../config";
import {
  getLifecyclesForBills,
  lifecycleMapKey,
  selectPresentedPendingLifecycleBills,
  upsertLifecycle,
  type LifecycleRow,
  type PresentedPendingLifecycleBill,
} from "../d1/lifecycle";
import { isTerminalLifecycle } from "../lifecycle/parse-actions";
import { fetchBillLifecycleSource } from "../sources/congress-client";
import { billLabel } from "./bill-label";

export interface LifecycleBillRow {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
}

export interface RefreshLifecyclesResult {
  refreshed: number;
  skipped: number;
  warnings: string[];
}

/** Lower number = refresh sooner when the per-run cap binds. */
export function lifecycleRefreshPriority(stored: LifecycleRow | undefined): number {
  if (!stored) return 0;
  if (stored.presented_date || stored.vetoed_date) return 1;
  return 2;
}

/**
 * Merge recent-voted bills with presented-but-not-terminal lifecycle rows.
 * Vote lookback alone misses bills still awaiting signature after passage ages out.
 */
export function mergeLifecycleRefreshCandidates(
  votedBills: LifecycleBillRow[],
  presentedPending: PresentedPendingLifecycleBill[]
): LifecycleBillRow[] {
  const seen = new Set<string>();
  const out: LifecycleBillRow[] = [];
  for (const row of [...votedBills, ...presentedPending]) {
    const key = lifecycleMapKey(row.bill_congress, row.bill_type, row.bill_number);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      bill_congress: row.bill_congress,
      bill_type: row.bill_type,
      bill_number: row.bill_number,
    });
  }
  return out;
}

/**
 * Refresh congress.gov lifecycle milestones for the given feed bills, plus any
 * presented-but-not-terminal rows still awaiting enactment. Terminal rows are
 * skipped. Candidates are ordered so missing and presidential-tracking rows win
 * when the refresh cap binds. Per-bill failures are collected as warnings and
 * never fail the caller.
 */
export async function refreshBillLifecycles(
  env: Env,
  bills: LifecycleBillRow[],
  trigger: string
): Promise<RefreshLifecyclesResult> {
  let refreshed = 0;
  let skipped = 0;
  const warnings: string[] = [];

  const presentedPending = await selectPresentedPendingLifecycleBills(env.DB);
  const candidates = mergeLifecycleRefreshCandidates(bills, presentedPending);

  const existing = await getLifecyclesForBills(
    env.DB,
    candidates.map((row) => ({
      congress: row.bill_congress,
      billType: row.bill_type,
      billNumber: row.bill_number,
    }))
  );

  const ranked = candidates
    .map((row, index) => {
      const key = lifecycleMapKey(row.bill_congress, row.bill_type, row.bill_number);
      const stored = existing.get(key);
      return { row, index, stored, priority: lifecycleRefreshPriority(stored) };
    })
    .sort((a, b) => a.priority - b.priority || a.index - b.index);

  for (const { row, stored } of ranked) {
    if (
      stored &&
      isTerminalLifecycle({
        law_kind: stored.law_kind,
        signed_date: stored.signed_date,
        vetoed_date: stored.vetoed_date,
        became_law_date: stored.became_law_date,
        public_law: stored.public_law,
      })
    ) {
      skipped += 1;
      continue;
    }

    if (refreshed >= LIFECYCLE_MAX_REFRESHES_PER_RUN) {
      skipped += 1;
      continue;
    }

    try {
      const source = await fetchBillLifecycleSource(env, {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      });
      const m = source.milestones;
      await upsertLifecycle(env.DB, {
        congress: row.bill_congress,
        billType: row.bill_type,
        billNumber: row.bill_number,
        introducedDate: source.introducedDate,
        presentedDate: m.presented_date,
        signedDate: m.signed_date,
        vetoedDate: m.vetoed_date,
        becameLawDate: m.became_law_date,
        lawKind: m.law_kind,
        publicLaw: m.public_law,
        latestActionDate: m.latest_action_date,
        latestActionText: m.latest_action_text,
      });
      refreshed += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const label = billLabel(row.bill_type, row.bill_number, row.bill_congress);
      warnings.push(`${label}: ${message}`);
      console.warn(
        JSON.stringify({
          event: "lifecycle_refresh_failed",
          trigger,
          bill: label,
          error: message,
        })
      );
    }
  }

  return { refreshed, skipped, warnings };
}

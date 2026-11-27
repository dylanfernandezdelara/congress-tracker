import {
  LIFECYCLE_MAX_REFRESHES_PER_RUN,
  LIFECYCLE_RECHECK_LAWS_UPDATED_BEFORE,
  LIFECYCLE_RECHECKS_PER_RUN,
} from "../constants";
import { congressNumber, type Env } from "../config";
import {
  clearLifecycleEnactment,
  getLifecyclesForBills,
  lifecycleMapKey,
  countLawsUpdatedBefore,
  selectLawsUpdatedBefore,
  selectPresentedPendingLifecycleBills,
  upsertLifecycle,
  type LifecycleBillRow,
  type LifecycleRow,
} from "../d1/lifecycle";
import { isTerminalLifecycle } from "../lifecycle/parse-actions";
import { fetchBillLifecycleSource } from "../sources/congress-client";
import { billLabel } from "./bill-label";

export type { LifecycleBillRow };

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
 * Merge lifecycle refresh groups (feed votes, public laws, presented-pending).
 * Earlier groups win when the same bill appears twice. Vote lookback alone
 * misses bills that became law after passage aged out.
 */
export function mergeLifecycleRefreshCandidates(
  ...groups: LifecycleBillRow[][]
): LifecycleBillRow[] {
  const seen = new Set<string>();
  const out: LifecycleBillRow[] = [];
  for (const row of groups.flat()) {
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

  const presentedPending = await selectPresentedPendingLifecycleBills(
    env.DB,
    congressNumber(env),
    LIFECYCLE_MAX_REFRESHES_PER_RUN
  );
  const staleLaws = await selectLawsUpdatedBefore(
    env.DB,
    congressNumber(env),
    LIFECYCLE_RECHECK_LAWS_UPDATED_BEFORE,
    LIFECYCLE_RECHECKS_PER_RUN
  );
  const candidates = mergeLifecycleRefreshCandidates(bills, presentedPending, staleLaws);

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
    const needsRecheck = Boolean(stored && stored.updated_at < LIFECYCLE_RECHECK_LAWS_UPDATED_BEFORE);
    if (
      stored &&
      !needsRecheck &&
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
      await writeLifecycle(env, row, stored, source, trigger);
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

type LifecycleSource = Awaited<ReturnType<typeof fetchBillLifecycleSource>>;

/** Store a bill's fresh Congress.gov milestones; clear a stored law that Congress.gov's own record does not show. */
async function writeLifecycle(
  env: Env,
  row: LifecycleBillRow,
  stored: LifecycleRow | undefined,
  source: LifecycleSource,
  trigger: string
): Promise<{ cleared: boolean }> {
  const m = source.milestones;
  const bill = billLabel(row.bill_type, row.bill_number, row.bill_congress);
  if (m.unrecognized.length) {
    console.warn(JSON.stringify({ event: "lifecycle_unrecognized_actions", trigger, bill, actions: m.unrecognized }));
  }
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
  if (stored?.became_law_date && !m.became_law_date && !m.public_law) {
    // Congress.gov's own record (laws list and actions) shows no enactment: the stored law came from bad data.
    await clearLifecycleEnactment(env.DB, {
      congress: row.bill_congress,
      billType: row.bill_type,
      billNumber: row.bill_number,
    });
    console.warn(
      JSON.stringify({ event: "lifecycle_enactment_cleared", trigger, bill, stored_public_law: stored.public_law })
    );
    return { cleared: true };
  }
  return { cleared: false };
}

export interface LawSnapshot {
  became_law_date: string | null;
  law_kind: string | null;
  public_law: string | null;
}

export interface LawRecheckChange {
  bill: string;
  before: LawSnapshot;
  after: LawSnapshot;
}

export interface LawRecheckResult {
  applied: boolean;
  checked: number;
  unchanged: number;
  changes: LawRecheckChange[];
  /** Laws still stored by the old parser after this run (dry runs leave the count as it was). */
  remaining: number;
  warnings: string[];
}

const snapshot = (r: { became_law_date: string | null; law_kind: string | null; public_law: string | null }): LawSnapshot => ({
  became_law_date: r.became_law_date ?? null,
  law_kind: r.law_kind ?? null,
  public_law: r.public_law ?? null,
});

/**
 * One-time repair, run on demand (POST /__pipeline/run/lifecycle-recheck): re-read stored laws from Congress.gov,
 * oldest first, and report each one whose law status changes. Dry run unless `apply`; nothing is written then.
 */
export async function recheckStoredLaws(
  env: Env,
  opts: { limit: number; apply: boolean; trigger: string }
): Promise<LawRecheckResult> {
  const congress = congressNumber(env);
  const rows = await selectLawsUpdatedBefore(env.DB, congress, LIFECYCLE_RECHECK_LAWS_UPDATED_BEFORE, opts.limit);
  const existing = await getLifecyclesForBills(
    env.DB,
    rows.map((r) => ({ congress: r.bill_congress, billType: r.bill_type, billNumber: r.bill_number }))
  );
  const changes: LawRecheckChange[] = [];
  const warnings: string[] = [];
  let checked = 0;
  let unchanged = 0;
  for (const row of rows) {
    const bill = billLabel(row.bill_type, row.bill_number, row.bill_congress);
    const stored = existing.get(lifecycleMapKey(row.bill_congress, row.bill_type, row.bill_number));
    try {
      const source = await fetchBillLifecycleSource(env, {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
      });
      const m = source.milestones;
      let after = snapshot(m);
      if (opts.apply) {
        const { cleared } = await writeLifecycle(env, row, stored, source, opts.trigger);
        if (cleared) after = { became_law_date: null, law_kind: null, public_law: null };
      } else if (stored?.became_law_date && !m.became_law_date && !m.public_law) {
        after = { became_law_date: null, law_kind: null, public_law: null };
      }
      checked += 1;
      const before = stored ? snapshot(stored) : { became_law_date: null, law_kind: null, public_law: null };
      if (JSON.stringify(before) === JSON.stringify(after)) unchanged += 1;
      else changes.push({ bill, before, after });
    } catch (err: unknown) {
      warnings.push(`${bill}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const remaining = await countLawsUpdatedBefore(env.DB, congress, LIFECYCLE_RECHECK_LAWS_UPDATED_BEFORE);
  return { applied: opts.apply, checked, unchanged, changes, remaining, warnings };
}

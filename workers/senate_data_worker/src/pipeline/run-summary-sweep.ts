import {
  SUMMARY_SWEEP_MAX_BILLS_PER_RUN,
  SUMMARY_SWEEP_RECHECK_HOURS,
} from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import { markSummaryChecked, selectSummarySweepCandidates } from "../d1/digests";
import { resolveOpenRouterModel } from "../synthesis/model";
import { refreshFeedDigests } from "./refresh-feed-digests";

export interface SummarySweepResult {
  checked: number;
  written: number;
  rewritten: number;
  skipped: number;
  warnings: string[];
}

/**
 * Hourly sweep for plain-language headlines. The daily feed run only refreshes
 * digests for bills in the feed window; bills that enter another way (new
 * introductions, public laws) are stored with just their official title. This
 * re-checks those on Congress.gov, oldest check first, at most once per
 * SUMMARY_SWEEP_RECHECK_HOURS each, and runs the same digest phases as the feed:
 * no digest → rewrite from the title (plain headline now), CRS text arrived →
 * rewrite from CRS. Never throws; a failure is reported in `warnings`.
 */
export async function runSummarySweep(
  env: Env,
  options: { limit?: number; now?: Date } = {}
): Promise<SummarySweepResult> {
  const now = options.now ?? new Date();
  const empty: SummarySweepResult = { checked: 0, written: 0, rewritten: 0, skipped: 0, warnings: [] };
  try {
    const checkedBefore = new Date(now.getTime() - SUMMARY_SWEEP_RECHECK_HOURS * 3_600_000);
    const candidates = await selectSummarySweepCandidates(env.DB, {
      congress: congressNumber(env),
      checkedBeforeIso: checkedBefore.toISOString(),
      limit: options.limit ?? SUMMARY_SWEEP_MAX_BILLS_PER_RUN,
    });
    if (candidates.length === 0) return empty;

    const model = await resolveOpenRouterModel(env);
    const result = await refreshFeedDigests(
      env,
      candidates.map((bill) => ({
        bill_congress: bill.congress,
        bill_type: bill.bill_type,
        bill_number: bill.number,
      })),
      model
    );
    await markSummaryChecked(env.DB, candidates, now.toISOString());
    return { checked: candidates.length, ...result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...empty, warnings: [`summary sweep failed: ${message}`] };
  }
}

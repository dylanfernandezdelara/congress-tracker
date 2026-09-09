import {
  BILL_TEXT_SECTIONS_BACKFILL_MAX_FETCHES,
  EXECUTIVE_SIGNAL_LOOKBACK_DAYS,
  FEED_MAX_BILLS,
  INTRO_LOOKBACK_DAYS,
  VOTE_LOOKBACK_DAYS,
} from "../constants";
import type { Env } from "../config";
import { inclusiveLookbackStartIso } from "../../../../shared/lookback";
import { selectFeedBills, selectRecentVotedBills } from "../d1/votes";
import { lookbackStartIso } from "../sources/congress-client";
import { mergeLifecycleRefreshCandidates } from "./refresh-lifecycles";
import {
  refreshBillTextSections,
  type RefreshBillTextSectionsResult,
} from "./refresh-bill-text-sections";

export interface BillTextBackfillResult extends RefreshBillTextSectionsResult {
  candidates: number;
  /** Alias of `remaining` so ops scripts can share the process-backfill loop. */
  bills_remaining: number;
}

/** Feed-visible bills: the same membership the daily run grounds chat on. */
export async function selectFeedTextCandidates(env: Env) {
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const votedBills = await selectRecentVotedBills(env.DB, lookback, FEED_MAX_BILLS);
  const feedWindowBills = await selectFeedBills(
    env.DB,
    lookback,
    lookbackStartIso(EXECUTIVE_SIGNAL_LOOKBACK_DAYS),
    inclusiveLookbackStartIso(INTRO_LOOKBACK_DAYS),
    FEED_MAX_BILLS
  );
  return mergeLifecycleRefreshCandidates(feedWindowBills, votedBills);
}

/**
 * Admin `POST /__pipeline/run/bill-text-backfill`: ingest full text sections
 * for every feed bill, with a higher per-run cap than the daily pipeline.
 * Re-invoke until `bills_remaining` is 0.
 */
export async function runBillTextBackfillPipeline(env: Env): Promise<BillTextBackfillResult> {
  const candidates = await selectFeedTextCandidates(env);
  const result = await refreshBillTextSections(env, candidates, "admin", {
    maxFetches: BILL_TEXT_SECTIONS_BACKFILL_MAX_FETCHES,
  });
  return { ...result, candidates: candidates.length, bills_remaining: result.remaining };
}

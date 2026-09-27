import { DIGEST_BATCH_BILLS_PER_RUN, DIGEST_REWRITES_PER_RUN } from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import { enqueueDigestJobs, selectBackfillSiteBills } from "../d1/digest-jobs";
import { getPipelineState, setPipelineState } from "../d1/pipeline-state";
import { dailyBudget } from "../digest/budget";
import { fetchUpdatedBillsPage } from "../sources/updated-bills";

/** Measured in production (2026-09-27): a Luna batch cost $0.035 for 40 bills; Sonnet rewrites ran $0.011–0.015. */
export const BACKFILL_COST_PER_BILL = { luna: 0.0009, sonnet: 0.014 };

export const BACKFILL_CURSOR_KEY = "digest_backfill_cursor";

/** Every bill of the Congress, walked a page per sweep run until done. */
export interface BackfillCursor {
  congress: number;
  offset: number;
  done: boolean;
  startedAt: string;
}

export interface BackfillPlan {
  scope: "site" | "congress";
  applied: boolean;
  bills: number;
  /** Bills that matter (Sonnet); the rest go to Luna batches. Unknown for bills not yet on the site. */
  matters: number | null;
  estimatedUsd: number;
  /** At the current per-run caps and daily budget. */
  estimatedDays: number;
  notes: string[];
}

function round(n: number, places = 2): number {
  return Math.round(n * 10 ** places) / 10 ** places;
}

/** Days to drain `luna` batch bills and `sonnet` rewrites at the sweep's hourly caps and the daily budget. */
function daysFor(env: Env, luna: number, sonnet: number): number {
  const byCaps = Math.max(luna / (DIGEST_BATCH_BILLS_PER_RUN * 24), sonnet / (DIGEST_REWRITES_PER_RUN * 24));
  const perDay = dailyBudget(env);
  const cost = luna * BACKFILL_COST_PER_BILL.luna + sonnet * BACKFILL_COST_PER_BILL.sonnet;
  // The sweep's own new bills take a share of each day's budget too; leave half for them.
  const byBudget = perDay > 0 ? cost / (perDay / 2) : Number.POSITIVE_INFINITY;
  return round(Math.max(byCaps, byBudget), 1);
}

/**
 * Summaries for bills written before the current writer. Dry run by default: it only counts and estimates.
 * - scope "site": bills already on the site without a current summary, queued now (the sweep writes them).
 * - scope "congress": every bill of the current Congress; the sweep walks Congress.gov a page per run.
 * Spend still goes through the sweep's daily budget and caps.
 */
export async function runSummaryBackfill(
  env: Env,
  options: { scope: "site" | "congress"; apply: boolean; limit?: number; now?: Date }
): Promise<BackfillPlan> {
  const congress = congressNumber(env);
  const site = await selectBackfillSiteBills(env.DB, congress);
  const notes: string[] = [];

  if (options.scope === "site") {
    const chosen = site.slice(0, options.limit ?? site.length);
    const matters = chosen.filter((b) => b.matters).length;
    const luna = chosen.length - matters;
    if (options.apply) await enqueueDigestJobs(env.DB, chosen, "new");
    else notes.push("Dry run: nothing queued. Add apply=1 to queue these bills.");
    return {
      scope: "site",
      applied: options.apply,
      bills: chosen.length,
      matters,
      estimatedUsd: round(luna * BACKFILL_COST_PER_BILL.luna + matters * BACKFILL_COST_PER_BILL.sonnet),
      estimatedDays: daysFor(env, luna, matters),
      notes,
    };
  }

  const apiKey = env.CONGRESS_API_KEY;
  if (!apiKey?.trim()) throw new Error("CONGRESS_API_KEY is required for a Congress backfill");
  const { total } = await fetchUpdatedBillsPage(apiKey, { congress, offset: 0, limit: 1 });
  const bills = total ?? 0;
  // Bills that matter are the ones on the site with votes or actions; the rest of the Congress is mostly first summaries.
  const matters = site.filter((b) => b.matters).length;
  const luna = Math.max(0, bills - matters);
  notes.push(
    "Bills not yet on the site get a stub row and a first summary (Luna, batched); bills that matter get Sonnet.",
    `At ${DIGEST_BATCH_BILLS_PER_RUN} bills an hour and $${dailyBudget(env)}/day this takes the days shown; raise DIGEST_DAILY_BUDGET_USD to go faster.`
  );
  if (options.apply) {
    const existing = await getPipelineState<BackfillCursor>(env.DB, BACKFILL_CURSOR_KEY);
    if (existing && !existing.done && existing.congress === congress) {
      notes.push(`Already running since ${existing.startedAt} (at offset ${existing.offset}).`);
    } else {
      await setPipelineState(env.DB, BACKFILL_CURSOR_KEY, {
        congress,
        offset: 0,
        done: false,
        startedAt: (options.now ?? new Date()).toISOString(),
      } satisfies BackfillCursor);
    }
  } else {
    notes.push("Dry run: nothing started. Add apply=1 to start.");
  }
  return {
    scope: "congress",
    applied: options.apply,
    bills,
    matters,
    estimatedUsd: round(luna * BACKFILL_COST_PER_BILL.luna + matters * BACKFILL_COST_PER_BILL.sonnet),
    estimatedDays: daysFor(env, luna, matters),
    notes,
  };
}

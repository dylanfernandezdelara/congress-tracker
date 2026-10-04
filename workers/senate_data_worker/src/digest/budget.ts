import type { Env } from "../config";
import { getPipelineState, setPipelineState } from "../d1/pipeline-state";

/** Default daily cap for bill summaries; expected spend is about $0.10/day (see digest/README in AGENTS.md). */
const DEFAULT_DAILY_BUDGET_USD = 1;

const key = (day: string) => `digest_spend:${day}`;
const today = (now = new Date()) => now.toISOString().slice(0, 10);

export function dailyBudget(env: Env): number {
  const n = Number.parseFloat(env.DIGEST_DAILY_BUDGET_USD ?? "");
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_BUDGET_USD;
}

export async function spentToday(env: Env, now = new Date()): Promise<number> {
  const state = await getPipelineState<{ usd: number }>(env.DB, key(today(now)));
  return state?.usd ?? 0;
}

/** Records in this isolate run one after another: a long bill's parts are called (and recorded) in parallel. */
let recording: Promise<unknown> = Promise.resolve();

/**
 * Add to today's spend; a negative amount corrects an earlier estimate (never below zero). Each record is a read
 * then a write, so records from this isolate are queued; across isolates last-writer-wins is fine: the cap is a
 * guard, and one sweep writes at a time.
 */
export function recordSpend(env: Env, usd: number, now = new Date()): Promise<void> {
  if (!Number.isFinite(usd) || usd === 0) return Promise.resolve();
  const next = recording.then(async () => {
    const current = await spentToday(env, now);
    await setPipelineState(env.DB, key(today(now)), { usd: Math.max(0, Math.round((current + usd) * 1e6) / 1e6) });
  });
  recording = next.catch(() => undefined);
  return next;
}

export async function budgetLeft(env: Env, now = new Date()): Promise<number> {
  return dailyBudget(env) - (await spentToday(env, now));
}

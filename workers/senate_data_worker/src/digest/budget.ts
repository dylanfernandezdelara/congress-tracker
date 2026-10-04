import type { Env } from "../config";
import { addPipelineStateUsd, getPipelineState } from "../d1/pipeline-state";

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

/**
 * Add to today's spend (UTC day of `now`); a negative amount corrects an earlier estimate (never below zero). One
 * atomic upsert, so parallel records (a long bill's parts) and other isolates never lose each other's updates. A
 * caller that records an estimate and later its correction passes the same `now`, so both land on the same day.
 */
export async function recordSpend(env: Env, usd: number, now = new Date()): Promise<void> {
  if (!Number.isFinite(usd) || usd === 0) return;
  await addPipelineStateUsd(env.DB, key(today(now)), usd);
}

export async function budgetLeft(env: Env, now = new Date()): Promise<number> {
  return dailyBudget(env) - (await spentToday(env, now));
}

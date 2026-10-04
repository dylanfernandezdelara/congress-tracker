import type { Env } from "../config";
import { approxTokens } from "./bill-text-parse";
import { budgetLeft } from "./budget";
import type { DigestModel } from "./models";
import type { DigestMessages } from "./prompt";

/** Luna's reasoning plus the JSON answer, per request (high effort runs 2–5k); estimates count a full budget. */
export const ESTIMATED_OUTPUT_TOKENS = 4_000;

/** Used when a model carries no price (an override): Luna's batch price. */
const FALLBACK_BATCH_PRICE = { input: 0.05, output: 0.25 };

function priceOf(model: DigestModel, api: "batch" | "direct"): { input: number; output: number } {
  const batch = model.batchPrice ?? FALLBACK_BATCH_PRICE;
  if (api === "batch") return batch;
  // The Batch API is half price, so a direct call without its own price costs double the batch price.
  return model.price ?? { input: batch.input * 2, output: batch.output * 2 };
}

/**
 * Upper-end estimate of what some requests will be charged: every prompt token, plus a full reasoning-and-answer
 * budget per request (capped by the model's output limit). Batches and direct calls use the same formula.
 */
export function estimateCost(model: DigestModel, requests: DigestMessages[], api: "batch" | "direct"): number {
  const price = priceOf(model, api);
  const input = requests.reduce((n, r) => n + approxTokens(r.system) + approxTokens(r.user), 0);
  const output = requests.length * Math.min(ESTIMATED_OUTPUT_TOKENS, model.maxTokens);
  return Math.round(((input * price.input + output * price.output) / 1e6) * 1e6) / 1e6;
}

/** The day's budget cannot cover the next paid call. Not the bill's fault and not the model's: it waits for tomorrow. */
export class BudgetShort extends Error {
  constructor(
    readonly left: number,
    readonly needs: number
  ) {
    super(`budget: $${Math.max(0, left).toFixed(3)} left, needs ~$${needs.toFixed(3)}`);
    this.name = "BudgetShort";
  }
}

/**
 * Checked before every paid direct call (a first try, the other model's retry, each slice of long-bill parts, each
 * combine): throws BudgetShort when the day's remaining budget is below the calls' estimate.
 */
export async function ensureBudget(env: Env, model: DigestModel, requests: DigestMessages[]): Promise<void> {
  const needs = estimateCost(model, requests, "direct");
  const left = await budgetLeft(env);
  if (left < needs) throw new BudgetShort(left, needs);
}

import type { Env } from "../config";

export interface DigestModel {
  id: string;
  /** Who serves the model: OpenRouter (default), or the Anthropic API directly (`anthropic-client.ts`). */
  provider?: "openrouter" | "anthropic";
  /** Anthropic models: thinking depth (they take no temperature). */
  effort?: "low" | "medium" | "high";
  /** Reasoning settings passed through to the provider (Luna: high effort). */
  reasoning?: { effort: "low" | "medium" | "high" };
  temperature?: number;
  /** Output budget; reasoning models spend part of it thinking before the JSON answer. */
  maxTokens: number;
  /** Batch API price per million tokens, for estimating a batch before it is charged. */
  batchPrice?: { input: number; output: number };
  /** Normal-API price per million tokens, for checking the budget before a direct call (default: twice batchPrice). */
  price?: { input: number; output: number };
}

/** First summaries of new bills: cheap and accurate in the evals. The sweep sends them through the Batch API (half price). */
export function newBillModel(env: Env): DigestModel {
  return { id: env.DIGEST_NEW_MODEL?.trim() || "openai/gpt-6-luna", reasoning: { effort: "high" }, maxTokens: 12_000, batchPrice: { input: 0.05, output: 0.25 } };
}

/**
 * Anthropic API prices per million tokens (normal API). DIGEST_REWRITE_MODEL set to one of these ids sends rewrites to
 * the Anthropic API with ANTHROPIC_API_KEY instead of OpenRouter. The output cap leaves room for thinking (billed as
 * output; round 7 replies used well under 2k) and is what the budget estimate assumes per call.
 */
const ANTHROPIC_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

/**
 * Rewrites of bills that matter (floor vote, reported by committee, law, in the feed): the writing readers
 * preferred in the round-2 blind review. Normal API: OpenRouter refuses Sonnet 5 batches (tested 2026-09-26).
 */
export function rewriteModel(env: Env): DigestModel {
  const id = env.DIGEST_REWRITE_MODEL?.trim() || "anthropic/claude-sonnet-5";
  const anthropicPrice = ANTHROPIC_PRICES[id];
  // Without the key, rewrites stay on OpenRouter rather than failing every hour as an account error.
  if (anthropicPrice && env.ANTHROPIC_API_KEY?.trim()) return { id, provider: "anthropic", effort: "medium", maxTokens: 8_000, price: anthropicPrice };
  return {
    id,
    temperature: 0.2,
    maxTokens: 4_000,
    // OpenRouter's normal-API price (free /api/v1/models endpoint, fetched 2026-10-04). The 4k-output assumption in
    // the estimate gives it its margin.
    price: { input: 2, output: 10 },
  };
}

/** Giant bills stay on the new-bill model at every tier: it won the blind pick there at a fraction of the cost. */
export function modelFor(env: Env, tier: "new" | "rewrite", long: boolean): DigestModel {
  return tier === "rewrite" && !long ? rewriteModel(env) : newBillModel(env);
}

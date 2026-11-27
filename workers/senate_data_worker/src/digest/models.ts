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
  /** Ask the provider for a JSON object reply (eval judges; summaries parse their JSON leniently). */
  json?: boolean;
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

/** The same models' OpenRouter ids, used when ANTHROPIC_API_KEY is not set. */
const OPENROUTER_IDS: Record<string, string> = {
  "claude-sonnet-5-5": "anthropic/claude-sonnet-5.5",
  "claude-opus-5-5": "anthropic/claude-opus-5.5",
  "claude-haiku-5-5": "anthropic/claude-haiku-5.5",
};

/**
 * Rewrites of bills that matter (floor vote, reported by committee, law, in the feed): the writing readers
 * preferred in the round-2 blind review. Normal API: OpenRouter refuses Sonnet 5 batches (tested 2026-09-26).
 */
const OPENROUTER_REWRITE_DEFAULT = "anthropic/claude-sonnet-5";

export function rewriteModel(env: Env): DigestModel {
  const configured = env.DIGEST_REWRITE_MODEL?.trim() || OPENROUTER_REWRITE_DEFAULT;
  const anthropicPrice = ANTHROPIC_PRICES[configured];
  if (anthropicPrice && env.ANTHROPIC_API_KEY?.trim()) {
    return { id: configured, provider: "anthropic", effort: "medium", maxTokens: 8_000, price: anthropicPrice };
  }
  // Without the key, the same model runs on OpenRouter under its OpenRouter id, with the same thinking depth and output
  // cap, at the same price. (An Anthropic API id is not an OpenRouter id: sending it failed every rewrite from
  // 2026-10-17; until 2026-11-27 the fallback then used Sonnet 5, not the Sonnet 5.5 Dylan picked after round 7.)
  const onOpenRouter = OPENROUTER_IDS[configured];
  if (onOpenRouter) {
    return { id: onOpenRouter, reasoning: { effort: "medium" }, maxTokens: 8_000, price: anthropicPrice! };
  }
  const id = configured;
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

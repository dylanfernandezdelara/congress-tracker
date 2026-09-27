import type { Env } from "../config";

export interface DigestModel {
  id: string;
  /** Reasoning settings passed through to the provider (Luna: high effort). */
  reasoning?: { effort: "low" | "medium" | "high" };
  temperature?: number;
  /** Output budget; reasoning models spend part of it thinking before the JSON answer. */
  maxTokens: number;
  /** Batch API price per million tokens, for estimating a batch before it is charged. */
  batchPrice?: { input: number; output: number };
}

/** First summaries of new bills: cheap and accurate in the evals. The sweep sends them through the Batch API (half price). */
export function newBillModel(env: Env): DigestModel {
  return { id: env.DIGEST_NEW_MODEL?.trim() || "openai/gpt-6-luna", reasoning: { effort: "high" }, maxTokens: 12_000, batchPrice: { input: 0.05, output: 0.25 } };
}

/**
 * Rewrites of bills that matter (floor vote, reported by committee, law, in the feed): the writing readers
 * preferred in the round-2 blind review. Normal API: OpenRouter refuses Sonnet 5 batches (tested 2026-09-26).
 */
export function rewriteModel(env: Env): DigestModel {
  return {
    id: env.DIGEST_REWRITE_MODEL?.trim() || "anthropic/claude-sonnet-5",
    temperature: 0.2,
    maxTokens: 4_000,
  };
}

/** Giant bills stay on the new-bill model at every tier: it won the blind pick there at a fraction of the cost. */
export function modelFor(env: Env, tier: "new" | "rewrite", long: boolean): DigestModel {
  return tier === "rewrite" && !long ? rewriteModel(env) : newBillModel(env);
}

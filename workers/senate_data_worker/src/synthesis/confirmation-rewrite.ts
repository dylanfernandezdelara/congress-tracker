import {
  normalizeDigestBullets,
  normalizeDigestLead,
  truncateAtSentenceBoundary,
} from "../../../../shared/feed-content";
import type { ConfirmationBackgroundContent } from "../../../../shared/confirmations-api-types";
import type { Env } from "../config";
import { buildConfirmationBackgroundPrompt } from "./confirmation-prompt";
import { jsonParseCandidates } from "./llm-json";
import { resolveOpenRouterModel } from "./model";
import { completeWithReasoningFallback } from "./openrouter-chat";

/** Re-export for callers/tests that imported the helper from this module. */
export { extractTrailingJsonObject } from "./llm-json";

const MAX_TOKENS = 768;
/**
 * Reasoning models stream chain-of-thought before the JSON answer; give the
 * fallback request enough budget so `finish_reason` is `stop`, not `length`.
 */
const REASONING_FALLBACK_MAX_TOKENS = 4096;
/** Person blurbs may be 1–2 sentences; keep more than a single lead sentence. */
const BACKGROUND_MAX_CHARS = 320;

function normalizePersonBackground(text: string): string {
  return truncateAtSentenceBoundary(text.trim(), BACKGROUND_MAX_CHARS);
}

export function parseConfirmationBackgroundJson(
  text: string
): ConfirmationBackgroundContent | null {
  for (const candidate of jsonParseCandidates(text)) {
    let parsed: ConfirmationBackgroundContent;
    try {
      parsed = JSON.parse(candidate) as ConfirmationBackgroundContent;
    } catch {
      continue;
    }
    if (!parsed.headline || !parsed.what_was_confirmed || !parsed.background) {
      continue;
    }
    // wikipedia_url is owned by enrichment, never by the model.
    return {
      headline: parsed.headline.trim(),
      what_was_confirmed: normalizeDigestLead(parsed.what_was_confirmed),
      background: normalizePersonBackground(parsed.background),
      key_points: normalizeDigestBullets(
        Array.isArray(parsed.key_points) ? parsed.key_points : []
      ),
    };
  }
  return null;
}

/**
 * Reasoning models (default free-tier picks) burn the whole token budget on
 * chain-of-thought and get cut off before the JSON answer. Ask with reasoning
 * disabled first; if that request is rejected or unparseable, retry with a
 * budget large enough for the reasoning trace plus the answer.
 */
export async function rewriteConfirmationBackground(
  env: Env,
  params: {
    citation: string;
    description: string | null;
    positionTitle: string | null;
    organization: string | null;
    rawBackground: string;
  },
  modelOverride?: string
): Promise<ConfirmationBackgroundContent | null> {
  const model = modelOverride ?? (await resolveOpenRouterModel(env));
  const prompt = buildConfirmationBackgroundPrompt(params);

  return completeWithReasoningFallback(
    env,
    model,
    prompt,
    parseConfirmationBackgroundJson,
    {
      maxTokens: MAX_TOKENS,
      reasoningFallbackMaxTokens: REASONING_FALLBACK_MAX_TOKENS,
    }
  );
}

import {
  normalizeDigestBullets,
  normalizeDigestLead,
  truncateAtSentenceBoundary,
} from "../../../../shared/feed-content";
import type { ConfirmationBackgroundContent } from "../../../../shared/confirmations-api-types";
import type { Env } from "../config";
import { buildConfirmationBackgroundPrompt } from "./confirmation-prompt";
import { resolveOpenRouterModel } from "./model";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

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

/**
 * Last balanced `{...}` block in mixed output. Reasoning models that inline
 * their thinking into `content` still end with the JSON answer.
 */
function extractTrailingJsonObject(text: string): string | null {
  const end = text.lastIndexOf("}");
  if (end === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = end; i >= 0; i -= 1) {
    const ch = text[i];
    if (inString) {
      // Walking backwards: a quote ends the string unless escaped from the left.
      if (ch === '"' && text[i - 1] !== "\\") inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "}") depth += 1;
    else if (ch === "{") {
      depth -= 1;
      if (depth === 0) return text.slice(i, end + 1);
    }
  }
  return null;
}

export function parseConfirmationBackgroundJson(
  text: string
): ConfirmationBackgroundContent | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();

  const candidates = [raw];
  const trailing = extractTrailingJsonObject(raw);
  if (trailing && trailing !== raw) candidates.push(trailing);

  for (const candidate of candidates) {
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

async function requestConfirmationCompletion(
  env: Env,
  model: string,
  prompt: string,
  options: { maxTokens: number; disableReasoning: boolean }
): Promise<ConfirmationBackgroundContent | null> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: options.maxTokens,
  };
  if (options.disableReasoning) {
    body.reasoning = { enabled: false };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://congress-tracker.local",
      "X-Title": "Congress Tracker",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return parseConfirmationBackgroundJson(content);
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

  const attempts = [
    { maxTokens: MAX_TOKENS, disableReasoning: true },
    { maxTokens: REASONING_FALLBACK_MAX_TOKENS, disableReasoning: false },
  ];
  for (const attempt of attempts) {
    const background = await requestConfirmationCompletion(
      env,
      model,
      prompt,
      attempt
    );
    if (background) return background;
  }
  return null;
}

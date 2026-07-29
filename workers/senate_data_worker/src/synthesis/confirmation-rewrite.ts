import {
  normalizeDigestBullets,
  normalizeDigestLead,
} from "../../../../shared/feed-content";
import type { ConfirmationBackgroundContent } from "../../../../shared/confirmations-api-types";
import type { Env } from "../config";
import { buildConfirmationBackgroundPrompt } from "./confirmation-prompt";
import { resolveOpenRouterModel } from "./model";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const MAX_TOKENS = 768;

export function parseConfirmationBackgroundJson(
  text: string
): ConfirmationBackgroundContent | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  try {
    const parsed = JSON.parse(raw) as ConfirmationBackgroundContent;
    if (!parsed.headline || !parsed.what_was_confirmed || !parsed.background) {
      return null;
    }
    return {
      headline: parsed.headline.trim(),
      what_was_confirmed: normalizeDigestLead(parsed.what_was_confirmed),
      background: normalizeDigestLead(parsed.background),
      key_points: normalizeDigestBullets(
        Array.isArray(parsed.key_points) ? parsed.key_points : []
      ),
    };
  } catch {
    return null;
  }
}

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

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://congress-tracker.local",
      "X-Title": "Congress Tracker",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: MAX_TOKENS,
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return parseConfirmationBackgroundJson(content);
}

import {
  normalizeDigestBullets,
  normalizeDigestLead,
} from "../../../../shared/feed-content";
import type { Env } from "../config";
import type { BillDigestContent } from "../types";
import { truncateCrsSummaryForRewrite } from "./crs-truncate";
import { stripMarkdownFence } from "./llm-json";
import { buildDigestPrompt, type DigestPromptMode } from "./prompt";
import { resolveOpenRouterModel } from "./model";
import { extractAcronyms } from "../sources/html-clean";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

const FULL_MAX_TOKENS = 1024;
const COMPACT_MAX_TOKENS = 512;

export function parseDigestJson(text: string): BillDigestContent | null {
  const raw = stripMarkdownFence(text);
  try {
    const parsed = JSON.parse(raw) as BillDigestContent;
    if (!parsed.headline || !parsed.what_it_does) return null;
    parsed.what_it_does = normalizeDigestLead(parsed.what_it_does);
    parsed.key_points = normalizeDigestBullets(
      Array.isArray(parsed.key_points) ? parsed.key_points : [],
    );
    parsed.terms_explained = Array.isArray(parsed.terms_explained)
      ? parsed.terms_explained.slice(0, 8)
      : [];
    return parsed;
  } catch {
    return null;
  }
}

async function requestDigestCompletion(
  env: Env,
  model: string,
  prompt: string,
  maxTokens: number
): Promise<BillDigestContent | null> {
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
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return parseDigestJson(content);
}

export async function rewriteSummary(
  env: Env,
  params: {
    title: string | null;
    billLabel: string;
    policyArea: string | null;
    rawSummary: string | null;
  },
  modelOverride?: string
): Promise<BillDigestContent | null> {
  const title = params.title?.trim() || null;
  const rawSummary = params.rawSummary?.trim()
    ? truncateCrsSummaryForRewrite(params.rawSummary)
    : "";
  if (!rawSummary && !title) return null;

  const model = modelOverride ?? (await resolveOpenRouterModel(env));
  const acronymSource = rawSummary || [title, params.policyArea].filter(Boolean).join(" ");
  const acronyms = extractAcronyms(acronymSource);
  const promptBase = {
    title,
    billLabel: params.billLabel,
    policyArea: params.policyArea,
    rawSummary,
    acronyms,
  };

  const modes: Array<{ mode: DigestPromptMode; maxTokens: number }> = [
    { mode: "full", maxTokens: FULL_MAX_TOKENS },
    { mode: "compact", maxTokens: COMPACT_MAX_TOKENS },
  ];

  for (const { mode, maxTokens } of modes) {
    const digest = await requestDigestCompletion(
      env,
      model,
      buildDigestPrompt({ ...promptBase, mode }),
      maxTokens
    );
    if (digest) return digest;
  }

  return null;
}

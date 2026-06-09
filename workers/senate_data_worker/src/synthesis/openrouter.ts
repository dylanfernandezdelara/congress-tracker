import type { Env } from "../config";
import type { BillDigestContent } from "../types";
import { buildDigestPrompt } from "./prompt";
import { extractAcronyms } from "../sources/html-clean";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export function parseDigestJson(text: string): BillDigestContent | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  try {
    const parsed = JSON.parse(raw) as BillDigestContent;
    if (!parsed.headline || !parsed.what_it_does) return null;
    parsed.key_points = Array.isArray(parsed.key_points) ? parsed.key_points.slice(0, 4) : [];
    parsed.terms_explained = Array.isArray(parsed.terms_explained)
      ? parsed.terms_explained.slice(0, 8)
      : [];
    return parsed;
  } catch {
    return null;
  }
}

export async function rewriteSummary(
  env: Env,
  params: {
    title: string | null;
    billLabel: string;
    policyArea: string | null;
    rawSummary: string;
  }
): Promise<BillDigestContent | null> {
  const model = env.OPENROUTER_MODEL?.split(",")[0]?.trim() || DEFAULT_MODEL;
  const acronyms = extractAcronyms(params.rawSummary);
  const prompt = buildDigestPrompt({ ...params, acronyms });

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
      max_tokens: 800,
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return parseDigestJson(content);
}

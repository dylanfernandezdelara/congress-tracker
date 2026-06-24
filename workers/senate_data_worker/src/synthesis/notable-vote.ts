import type { Env } from "../config";
import { resolveOpenRouterModel } from "./model";
import {
  buildNotableVotePrompt,
  type NotableVotePromptContext,
} from "./notable-vote-prompt";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface NotableVoteLlmResult {
  why_it_matters: string;
}

export function parseNotableVoteJson(text: string): NotableVoteLlmResult | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  try {
    const parsed = JSON.parse(raw) as NotableVoteLlmResult;
    const blurb = parsed.why_it_matters?.trim();
    if (!blurb || blurb.length < 12) return null;
    return { why_it_matters: blurb.slice(0, 400) };
  } catch {
    return null;
  }
}

export async function synthesizeNotableVoteBlurb(
  env: Env,
  ctx: NotableVotePromptContext
): Promise<NotableVoteLlmResult | null> {
  if (!env.OPENROUTER_API_KEY?.trim()) return null;

  const model = await resolveOpenRouterModel(env);
  const prompt = buildNotableVotePrompt(ctx);

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
      max_tokens: 256,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return parseNotableVoteJson(content);
}

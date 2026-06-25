import type { ExecutiveCatalogBill, ExecutiveLinkLlmResult } from "../../../../shared/executive-api-types";
import type { Env } from "../config";
import { parseExecutiveLinkJson } from "../executive/guardrails";
import { resolveOpenRouterModel } from "./model";
import { buildExecutiveLinkPrompt } from "./executive-link-prompt";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function linkExecutivePostWithLlm(
  env: Env,
  params: {
    postText: string;
    postedAt: string;
    catalog: ExecutiveCatalogBill[];
  }
): Promise<ExecutiveLinkLlmResult | null> {
  if (!env.OPENROUTER_API_KEY?.trim()) return null;

  const model = await resolveOpenRouterModel(env);
  const prompt = buildExecutiveLinkPrompt(params);

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
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return parseExecutiveLinkJson(content);
}

import type { ExecutiveCatalogBill, ExecutiveLinkLlmResult } from "../../../../shared/executive-api-types";
import type { Env } from "../config";
import { congressNumber } from "../config";
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
  const prompt = buildExecutiveLinkPrompt({
    ...params,
    congress: congressNumber(env),
  });

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

  if (!res.ok) {
    console.warn(
      JSON.stringify({
        event: "executive_link_llm_failed",
        status: res.status,
        model,
      })
    );
    return null;
  }

  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.warn(JSON.stringify({ event: "executive_link_llm_empty", model }));
    return null;
  }

  const parsed = parseExecutiveLinkJson(content);
  if (!parsed) {
    console.warn(JSON.stringify({ event: "executive_link_llm_parse_failed", model }));
  }
  return parsed;
}

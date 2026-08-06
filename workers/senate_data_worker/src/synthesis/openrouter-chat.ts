import type { Env } from "../config";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const DEFAULT_MAX_TOKENS = 512;
/** Reasoning fallback needs room for chain-of-thought plus the JSON answer. */
const DEFAULT_REASONING_FALLBACK_MAX_TOKENS = 4096;

/**
 * Single OpenRouter chat completion → message content string.
 * Returns null on HTTP/empty failures (caller decides retry policy).
 */
export async function fetchOpenRouterChatContent(
  env: Env,
  options: {
    model: string;
    prompt: string;
    maxTokens: number;
    disableReasoning?: boolean;
    temperature?: number;
  }
): Promise<string | null> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: [{ role: "user", content: options.prompt }],
    temperature: options.temperature ?? 0,
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
  return content?.trim() ? content : null;
}

/**
 * Reasoning models (default free-tier picks) often burn the token budget on
 * chain-of-thought and get cut off before the JSON answer. Ask with reasoning
 * disabled first; if that request is rejected or unparseable, retry with a
 * budget large enough for the reasoning trace plus the answer.
 *
 * `parse` should return null on unusable content. Empty-but-valid answers
 * (e.g. `""` for a grounded field) must return a non-null value so we stop.
 */
export async function completeWithReasoningFallback<T>(
  env: Env,
  model: string,
  prompt: string,
  parse: (content: string) => T | null,
  options?: {
    maxTokens?: number;
    reasoningFallbackMaxTokens?: number;
  }
): Promise<T | null> {
  const attempts = [
    {
      maxTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      disableReasoning: true,
    },
    {
      maxTokens:
        options?.reasoningFallbackMaxTokens ??
        DEFAULT_REASONING_FALLBACK_MAX_TOKENS,
      disableReasoning: false,
    },
  ];

  for (const attempt of attempts) {
    const content = await fetchOpenRouterChatContent(env, {
      model,
      prompt,
      maxTokens: attempt.maxTokens,
      disableReasoning: attempt.disableReasoning,
    });
    if (!content) continue;
    const parsed = parse(content);
    if (parsed !== null) return parsed;
  }
  return null;
}

import type { Env } from "../config";
import type { DigestMessages } from "./prompt";
import type { DigestModel } from "./models";

const OPENROUTER = "https://openrouter.ai/api/v1";
const CALL_TIMEOUT_MS = 180_000;

export interface CallUsage {
  cost: number;
  promptTokens: number;
  completionTokens: number;
}

export interface ChatResult {
  content: string | null;
  usage: CallUsage;
  /** OpenRouter generation id, for AI Gateway feedback and debugging. */
  generationId: string | null;
}

interface ChatBody {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
  id?: string;
  error?: { message?: string };
}

function headers(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://trackcongress.org",
    "X-Title": "Track Congress",
  };
}

/** The per-request body for one model, shared by normal calls and batch requests. */
export function requestBody(model: DigestModel, messages: DigestMessages): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    max_tokens: model.maxTokens,
  };
  if (model.temperature !== undefined) body.temperature = model.temperature;
  if (model.reasoning) body.reasoning = model.reasoning;
  return body;
}

function usageOf(body: ChatBody): CallUsage {
  return {
    cost: body.usage?.cost ?? 0,
    promptTokens: body.usage?.prompt_tokens ?? 0,
    completionTokens: body.usage?.completion_tokens ?? 0,
  };
}

class PermanentError extends Error {}

/**
 * One normal (non-batch) completion. Network errors, 429 and 5xx are retried once; other 4xx (a bad request, no
 * credits) are not, since a second try would fail the same way. An empty reply returns content null.
 */
export async function chatCompletion(env: Env, model: DigestModel, messages: DigestMessages): Promise<ChatResult> {
  const base = env.OPENROUTER_BASE_URL?.trim() || OPENROUTER;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: headers(env),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        body: JSON.stringify({ model: model.id, ...requestBody(model, messages), usage: { include: true } }),
      });
      const body = (await res.json().catch(() => ({}))) as ChatBody;
      if (!res.ok) {
        const text = body.error?.message ?? `HTTP ${res.status}`;
        throw res.status === 429 || res.status >= 500 ? new Error(text) : new PermanentError(text);
      }
      return { content: body.choices?.[0]?.message?.content ?? null, usage: usageOf(body), generationId: body.id ?? null };
    } catch (err: unknown) {
      lastError = err;
      if (err instanceof PermanentError) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface BatchRequest {
  customId: string;
  messages: DigestMessages;
}

/** Submit one OpenRouter batch; returns its id. endpoint/model must precede requests in the body. */
export async function submitBatch(env: Env, model: DigestModel, requests: BatchRequest[]): Promise<string> {
  const res = await fetch(`${OPENROUTER}/batches`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      endpoint: "/v1/chat/completions",
      model: model.id,
      requests: requests.map((r) => ({ custom_id: r.customId, body: requestBody(model, r.messages) })),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !body.id) throw new Error(`batch submit failed: ${body.error?.message ?? `HTTP ${res.status}`}`);
  return body.id;
}

export type BatchStatus = "validating" | "in_progress" | "finalizing" | "completed" | "failed" | "expired" | "cancelled" | "cancelling";

export interface BatchResultItem {
  customId: string;
  content: string | null;
  error: string | null;
  usage: CallUsage;
  generationId: string | null;
}

export interface BatchState {
  status: BatchStatus;
  done: boolean;
  /** OpenRouter's charge for the whole batch, when reported. */
  cost: number | null;
  results: BatchResultItem[];
}

interface BatchBody {
  status?: BatchStatus;
  usage?: { cost?: number } | null;
  results?: Array<{
    custom_id?: string;
    response?: { status_code?: number; body?: ChatBody } | null;
    error?: { message?: string } | string | null;
  }> | null;
}

export async function getBatch(env: Env, id: string): Promise<BatchState> {
  const res = await fetch(`${OPENROUTER}/batches/${encodeURIComponent(id)}`, { headers: headers(env) });
  const body = (await res.json().catch(() => ({}))) as BatchBody;
  if (!res.ok) throw new Error(`batch status failed: HTTP ${res.status}`);
  const status = body.status ?? "in_progress";
  const done = ["completed", "failed", "expired", "cancelled"].includes(status);
  const results: BatchResultItem[] = (body.results ?? []).map((r) => {
    const ok = r.response?.status_code === 200;
    const errorText = typeof r.error === "string" ? r.error : r.error?.message ?? null;
    return {
      customId: r.custom_id ?? "",
      content: ok ? r.response?.body?.choices?.[0]?.message?.content ?? null : null,
      error: ok ? errorText : errorText ?? `status ${r.response?.status_code ?? "missing"}`,
      usage: usageOf(r.response?.body ?? {}),
      generationId: r.response?.body?.id ?? null,
    };
  });
  // The batch total when reported, else the sum of what each request says it cost.
  const itemCost = results.reduce((n, r) => n + r.usage.cost, 0);
  return { status, done, cost: body.usage?.cost ?? (itemCost > 0 ? itemCost : null), results };
}

/** Best effort: stop a batch we have given up on, so it cannot charge later. */
export async function cancelBatch(env: Env, id: string): Promise<void> {
  await fetch(`${OPENROUTER}/batches/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: headers(env) }).catch(() => undefined);
}

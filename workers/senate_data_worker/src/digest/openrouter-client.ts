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
  /** OpenRouter generation id, for debugging. */
  generationId: string | null;
  /** AI Gateway log id (`cf-aig-log-id`) when the call went through the gateway, to attach feedback to the log. */
  gatewayLogId: string | null;
}

interface ChatBody {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
  id?: string;
  error?: { message?: string };
}

/** Normal calls go through Cloudflare AI Gateway when OPENROUTER_BASE_URL points at it (logging, analytics). */
const isGateway = (base: string) => base.startsWith("https://gateway.ai.cloudflare.com/");

function headers(env: Env, base = OPENROUTER): Record<string, string> {
  // The gateway token goes to the gateway only, never to OpenRouter.
  const gatewayToken = isGateway(base) ? env.CF_AIG_TOKEN?.trim() : undefined;
  return {
    ...(gatewayToken ? { "cf-aig-authorization": `Bearer ${gatewayToken}` } : {}),
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

/** The OpenRouter account itself is refusing (no credits, bad key): nothing to do with the bill being written. */
export class AccountError extends PermanentError {}

/**
 * How a caller keeps the day's spend honest for one paid call. `record` adds to (or, negative, corrects) the
 * recorded spend; `estimate` is what one attempt is assumed to cost until the provider says otherwise.
 */
export interface SpendHook {
  estimate: number;
  record: (usd: number) => Promise<void>;
}

/**
 * One normal (non-batch) completion. Network errors, timeouts, 429 and 5xx are retried once; other 4xx (a bad
 * request, no credits) are not, since a second try would fail the same way. An empty reply returns content null.
 *
 * With a spend hook, each attempt's estimate is recorded before the request goes out. A provider can bill a request
 * whose reply never reached us (our 180s timeout, a dropped connection, a worker killed mid-call), so the estimate
 * stands for every attempt that got no reply. An attempt the provider answered with an error status was not
 * generated, so its estimate is taken back. A reply settles the whole call: what was recorded becomes its actual
 * charge (or one estimate when the reply carries no cost).
 */
export async function chatCompletion(env: Env, model: DigestModel, messages: DigestMessages, spend?: SpendHook): Promise<ChatResult> {
  const base = env.OPENROUTER_BASE_URL?.trim() || OPENROUTER;
  let lastError: unknown = null;
  let recorded = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // Outside the try: if the spend cannot be recorded, nothing is sent.
    if (spend) {
      await spend.record(spend.estimate);
      recorded += spend.estimate;
    }
    let answered = false;
    let result: { chat: ChatResult; cost: number | null };
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: headers(env, base),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        body: JSON.stringify({ model: model.id, ...requestBody(model, messages), usage: { include: true } }),
      });
      const body = (await res.json().catch(() => ({}))) as ChatBody;
      if (!res.ok) {
        answered = true;
        const text = body.error?.message ?? `HTTP ${res.status}`;
        if (res.status === 429 || res.status >= 500) throw new Error(text);
        // A refusal from the gateway itself (missing or rotated CF_AIG_TOKEN) names the gateway, not OpenRouter.
        const who = isGateway(base) && body.error === undefined ? "AI Gateway" : "OpenRouter account";
        throw [401, 402, 403].includes(res.status) ? new AccountError(`${who}: ${text}`) : new PermanentError(text);
      }
      result = {
        chat: {
          content: body.choices?.[0]?.message?.content ?? null,
          usage: usageOf(body),
          generationId: body.id ?? null,
          gatewayLogId: res.headers.get("cf-aig-log-id"),
        },
        cost: typeof body.usage?.cost === "number" ? body.usage.cost : null,
      };
    } catch (err: unknown) {
      lastError = err;
      if (spend && answered) {
        await spend.record(-spend.estimate);
        recorded -= spend.estimate;
      }
      if (err instanceof PermanentError) break;
      continue;
    }
    // After the try, so a failure to record can never trigger a second paid request.
    if (spend) await spend.record((result.cost ?? spend.estimate) - recorded);
    return result.chat;
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

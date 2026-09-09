import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  BILL_CHAT_MAX_QUESTION_CHARS,
  BILL_CHAT_MAX_SELECTION_CHARS,
  type BillChatError,
} from "../../../../shared/chat-api-types";
import { parseBillQueryParam } from "../../../../shared/bill-id";
import type { Env } from "../config";
import {
  BILL_CHAT_EVIDENCE_MAX_CHARS,
  CHAT_DAILY_GLOBAL_CAP,
  CHAT_DAILY_PER_CLIENT_CAP,
} from "../constants";
import { reserveChatUsage, utcChatDay } from "../d1/chat-usage";
import { FALLBACK_FREE_OPENROUTER_MODEL, resolveOpenRouterModel } from "../synthesis/model";
import { loadBillEvidence, selectEvidence } from "../chat/bill-chat-evidence";
import {
  applySelection,
  buildBillChatSystemPrompt,
  filterChatHistory,
  latestUserQuestion,
  writeBillChatStream,
  BILL_CHAT_ERROR_TEXT,
  isAbortError,
  type BillChatStreamText,
  type BillChatUIMessage,
} from "../chat/bill-chat-run";
import {
  NO_STORE_HEADERS,
  publicErrorResponse,
  rateLimitKey,
  readJsonBody,
  type JsonFn,
} from "./public-json";
import { cacheNoStore } from "./responses";

/** Message history plus selection; generous, but a chat turn is never 64KB. */
const MAX_BODY_BYTES = 64 * 1024;
const NO_STORE = NO_STORE_HEADERS;

export type BillChatDeps = {
  streamText?: BillChatStreamText;
  loadEvidence?: typeof loadBillEvidence;
  reserveUsage?: typeof reserveChatUsage;
  resolveModel?: (env: Env) => Promise<string>;
  now?: () => Date;
};

/**
 * Curated free fallbacks for the OpenRouter `models` list. The intelligence-index
 * pick can be gated (403 "agentic harnesses only") or overloaded, and the generic
 * `openrouter/free` router is a lottery (content-safety classifiers, models that
 * spend the whole budget on reasoning), so fall back to models that answer this
 * prompt shape reliably with reasoning turned down.
 */
export const CHAT_FALLBACK_MODELS: readonly string[] = [
  FALLBACK_FREE_OPENROUTER_MODEL,
  "nvidia/nemotron-3-super-120b-a12b:free",
];

export function chatModelRoute(modelId: string): string[] {
  return [...new Set([modelId, ...CHAT_FALLBACK_MODELS])];
}

/**
 * Low-effort, excluded reasoning: reasoning tokens count against
 * `maxOutputTokens`, and some free endpoints refuse `enabled: false`.
 */
export const CHAT_REASONING = { effort: "low", exclude: true } as const;

/**
 * Room for a 180-word answer plus two or three verbatim passages after
 * low-effort reasoning (reasoning tokens count against this cap on OpenRouter).
 */
export const CHAT_MAX_OUTPUT_TOKENS = 1600;

const errorResponse = publicErrorResponse<BillChatError>;

function parseChatRequest(body: unknown): {
  messages: unknown[];
  bill: string;
  selection?: string;
} | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.bill !== "string" || !Array.isArray(record.messages)) return null;
  const parsed: { messages: unknown[]; bill: string; selection?: string } = {
    messages: record.messages,
    bill: record.bill,
  };
  if (record.selection !== undefined) {
    if (typeof record.selection !== "string") return null;
    parsed.selection = record.selection;
  }
  return parsed;
}

/**
 * `POST /chat/bill` — public UI-message stream. Grounded answers with verified
 * quote parts; allowed on preview hosts (not a pipeline write).
 */
export async function handleBillChat(params: {
  request: Request;
  env: Env;
  json: JsonFn;
  corsHeaders: HeadersInit;
  deps?: BillChatDeps;
}): Promise<Response> {
  const { request, env, json, corsHeaders, deps = {} } = params;
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: NO_STORE });
  }

  if (env.CHAT_RATE_LIMITER) {
    try {
      const outcome = await env.CHAT_RATE_LIMITER.limit({ key: rateLimitKey(request) });
      if (!outcome.success) {
        return errorResponse(
          json,
          429,
          "rate_limited",
          "Too many chat questions. Wait a minute and try again."
        );
      }
    } catch (err: unknown) {
      console.warn("chat_rate_limiter_unavailable", err);
    }
  }

  const parsed = parseChatRequest(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed) {
    return errorResponse(
      json,
      400,
      "bad_request",
      "Body must be JSON with `bill` and `messages`."
    );
  }
  const bill = parseBillQueryParam(parsed.bill);
  if (!bill) {
    return errorResponse(json, 400, "bad_request", "`bill` must look like 119-hr-1.");
  }
  const question = latestUserQuestion(parsed.messages);
  if (!question) {
    return errorResponse(
      json,
      400,
      "bad_request",
      "Send at least one user message with a non-empty text part."
    );
  }
  if (question.length > BILL_CHAT_MAX_QUESTION_CHARS) {
    return errorResponse(
      json,
      400,
      "bad_request",
      `Questions are limited to ${BILL_CHAT_MAX_QUESTION_CHARS} characters.`
    );
  }
  if (parsed.selection !== undefined && parsed.selection.length > BILL_CHAT_MAX_SELECTION_CHARS) {
    return errorResponse(
      json,
      400,
      "bad_request",
      `Selected passages are limited to ${BILL_CHAT_MAX_SELECTION_CHARS} characters.`
    );
  }
  if (!env.OPENROUTER_API_KEY?.trim()) {
    return errorResponse(
      json,
      503,
      "chat_unavailable",
      "Chat is not configured on this worker."
    );
  }

  // Claim the daily slot before the evidence read so a capped client costs one
  // single-row upsert per 429, not a full digest + bill-text load. A 404 below
  // therefore spends a slot; the UI only offers chat for bills already in the feed.
  const reserve = deps.reserveUsage ?? reserveChatUsage;
  const usage = await reserve(env.DB, {
    day: utcChatDay(deps.now?.() ?? new Date()),
    clientKey: rateLimitKey(request),
    perClientCap: CHAT_DAILY_PER_CLIENT_CAP,
    globalCap: CHAT_DAILY_GLOBAL_CAP,
  });
  if (usage !== "ok") {
    return errorResponse(
      json,
      429,
      "daily_limit",
      usage === "client_capped"
        ? "This address has reached today's chat limit."
        : "The site-wide chat limit for today has been reached."
    );
  }

  const loadEvidence = deps.loadEvidence ?? loadBillEvidence;
  const loaded = await loadEvidence(env, bill);
  if (!loaded) {
    return errorResponse(json, 404, "bill_not_found", "That bill is not in the feed yet.");
  }

  const query = [parsed.selection, question].filter(Boolean).join(" ");
  const evidence = selectEvidence(loaded.chunks, query, {
    maxChars: BILL_CHAT_EVIDENCE_MAX_CHARS,
  });
  const history = applySelection(filterChatHistory(parsed.messages), parsed.selection);
  const system = buildBillChatSystemPrompt({
    title: loaded.title,
    bill,
    chunks: evidence,
  });
  const modelMessages = await convertToModelMessages(history);
  const modelId = await (deps.resolveModel ?? resolveOpenRouterModel)(env);
  const runStream = deps.streamText ?? streamText;
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

  const stream = createUIMessageStream<BillChatUIMessage>({
    execute: async ({ writer }) => {
      let streamError: unknown = null;
      try {
        const result = await Promise.resolve(
          runStream({
            model: openrouter(modelId),
            system,
            messages: modelMessages,
            temperature: 0.2,
            maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
            onError: ({ error }: { error: unknown }) => {
              streamError = error;
            },
            // Stop in the UI aborts the fetch; without this the OpenRouter run
            // would keep generating (and billing) for a reader who left.
            abortSignal: request.signal,
            providerOptions: {
              openrouter: { models: chatModelRoute(modelId), reasoning: CHAT_REASONING },
            },
          })
        );
        await writeBillChatStream({
          writer,
          textStream: result.textStream,
          bill,
          chunks: evidence,
          hmacSecret: env.CHAT_HMAC_SECRET,
          streamError: () => streamError,
        });
        const finishReason = result.finishReason
          ? await Promise.resolve(result.finishReason).catch(() => undefined)
          : undefined;
        if (finishReason === "length") {
          console.warn(JSON.stringify({ event: "bill_chat_truncated", model: modelId, maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS }));
        }
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        console.error("bill_chat_llm_error", err);
        writer.write({ type: "error", errorText: BILL_CHAT_ERROR_TEXT });
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      ...corsHeaders,
      "Cache-Control": cacheNoStore,
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

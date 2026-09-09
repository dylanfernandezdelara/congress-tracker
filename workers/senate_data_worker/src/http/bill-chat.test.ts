import { describe, expect, it, vi } from "vitest";

import {
  BILL_CHAT_MAX_QUESTION_CHARS,
  BILL_CHAT_MAX_SELECTION_CHARS,
  BILL_CHAT_UNVERIFIED_PLACEHOLDER,
} from "../../../../shared/chat-api-types";
import { verifyAnswerSignature } from "../chat/answer-signature";
import type { EvidenceChunk } from "../chat/bill-chat-evidence";
import type { DigestRow } from "../d1/digests";
import { CHAT_FALLBACK_MODELS, CHAT_REASONING, chatModelRoute, handleBillChat } from "./bill-chat";
import { buildJsonResponse } from "./responses";
import { createMockEnv } from "./test-fixtures";

const json = (body: unknown, init?: ResponseInit) => buildJsonResponse(body, {}, init);
const corsHeaders = { "Access-Control-Allow-Origin": "*" };

const DIGEST_ROW: DigestRow = {
  congress: 119,
  bill_type: "HR",
  number: 1,
  title: "Widget Act",
  policy_area: null,
  raw_summary_text: null,
  digest_json: null,
};

const SECTION: EvidenceChunk = {
  id: "bill_text-0",
  source: "bill_text",
  section_label: "Sec. 3. Definitions",
  text: "A widget is a device.",
};

function userMessage(text: string, id = "u1") {
  return { id, role: "user" as const, parts: [{ type: "text" as const, text }] };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://worker.example.com/chat/bill", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readSse(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  const chunks: Array<Record<string, unknown>> = [];
  for (const block of text.split("\n\n")) {
    const line = block.split("\n").find((entry) => entry.startsWith("data: "));
    if (!line) continue;
    const payload = line.slice(6);
    if (payload === "[DONE]") continue;
    chunks.push(JSON.parse(payload) as Record<string, unknown>);
  }
  return chunks;
}

function okUsage() {
  return vi.fn(async () => "ok" as const);
}

const resolveModel = async () => "test-model";

describe("POST /chat/bill", () => {
  it("validates method, body, bill, question, and selection", async () => {
    const env = createMockEnv();
    const get = await handleBillChat({
      request: new Request("https://worker.example.com/chat/bill"),
      env: env as never,
      json,
      corsHeaders,
    });
    expect(get.status).toBe(405);

    const badJson = await handleBillChat({
      request: post("{not json"),
      env: env as never,
      json,
      corsHeaders,
    });
    expect(await badJson.json()).toMatchObject({ error: "bad_request" });

    const badBill = await handleBillChat({
      request: post({ bill: "hr-1", messages: [userMessage("What does this do?")] }),
      env: env as never,
      json,
      corsHeaders,
    });
    expect(await badBill.json()).toMatchObject({ error: "bad_request" });

    const emptyUser = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("   ")] }),
      env: env as never,
      json,
      corsHeaders,
    });
    expect(await emptyUser.json()).toMatchObject({ error: "bad_request" });

    const longQ = await handleBillChat({
      request: post({
        bill: "119-hr-1",
        messages: [userMessage("x".repeat(BILL_CHAT_MAX_QUESTION_CHARS + 1))],
      }),
      env: env as never,
      json,
      corsHeaders,
    });
    expect(await longQ.json()).toMatchObject({ error: "bad_request" });

    const longSel = await handleBillChat({
      request: post({
        bill: "119-hr-1",
        messages: [userMessage("What does this do?")],
        selection: "y".repeat(BILL_CHAT_MAX_SELECTION_CHARS + 1),
      }),
      env: env as never,
      json,
      corsHeaders,
    });
    expect(await longSel.json()).toMatchObject({ error: "bad_request" });
  });

  it("returns 503 when OpenRouter is not configured", async () => {
    const env = createMockEnv({ OPENROUTER_API_KEY: "" });
    const response = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What does this do?")] }),
      env: env as never,
      json,
      corsHeaders,
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "chat_unavailable" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 404 when the bill has no digest", async () => {
    const env = createMockEnv();
    const response = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What does this do?")] }),
      env: env as never,
      json,
      corsHeaders,
      deps: { loadEvidence: async () => null, reserveUsage: okUsage() },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "bill_not_found" });
  });

  it("returns 429 rate_limited when the burst limiter denies and fails open when it throws", async () => {
    const denied = { limit: vi.fn(async () => ({ success: false })) };
    const deniedRes = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What does this do?")] }),
      env: createMockEnv({ CHAT_RATE_LIMITER: denied }) as never,
      json,
      corsHeaders,
    });
    expect(deniedRes.status).toBe(429);
    expect(await deniedRes.json()).toMatchObject({ error: "rate_limited" });

    const broken = {
      limit: vi.fn(async () => {
        throw new Error("binding down");
      }),
    };
    const open = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What does this do?")] }),
      env: createMockEnv({ CHAT_RATE_LIMITER: broken }) as never,
      json,
      corsHeaders,
      deps: { loadEvidence: async () => null, reserveUsage: okUsage() },
    });
    expect(open.status).toBe(404);
  });

  it("returns 429 daily_limit when a daily cap is reserved as exceeded", async () => {
    const env = createMockEnv();
    const response = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What does this do?")] }),
      env: env as never,
      json,
      corsHeaders,
      deps: {
        loadEvidence: async () => ({ title: "Widget Act", digestRow: DIGEST_ROW, chunks: [SECTION] }),
        reserveUsage: async () => "client_capped",
      },
    });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "daily_limit" });
  });

  it("streams a verified quote, placeholder, and signed data-answer", async () => {
    const secret = "unit-test-hmac";
    const env = createMockEnv({ CHAT_HMAC_SECRET: secret });
    async function* tokens() {
      yield "The Act says ";
      yield '<quote section="Sec. 3. Definitions">A widget is a device.</quote>';
      yield " and then ";
      yield '<quote section="Sec. 3. Definitions">this invented sentence is not in the evidence.</quote>';
      yield " The end.";
    }
    const response = await handleBillChat({
      request: post({
        bill: "119-hr-1",
        messages: [userMessage("What is a widget?")],
        selection: "A widget is a device.",
      }),
      env: env as never,
      json,
      corsHeaders,
      deps: {
        loadEvidence: async () => ({ title: "Widget Act", digestRow: DIGEST_ROW, chunks: [SECTION] }),
        reserveUsage: okUsage(),
        resolveModel,
        streamText: async () => ({ textStream: tokens() }),
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    const chunks = await readSse(response);
    expect(chunks.some((c) => c.type === "source-document")).toBe(true);
    const quote = chunks.find((c) => c.type === "data-quote");
    expect(quote).toMatchObject({
      type: "data-quote",
      data: {
        text: "A widget is a device.",
        section_label: "Sec. 3. Definitions",
        source: "bill_text",
      },
    });
    const deltas = chunks
      .filter((c) => c.type === "text-delta")
      .map((c) => String(c.delta))
      .join("");
    expect(deltas).toContain(BILL_CHAT_UNVERIFIED_PLACEHOLDER);
    expect(deltas).not.toContain("this invented sentence");
    const answer = chunks.find((c) => c.type === "data-answer");
    expect(answer?.data).toMatchObject({
      unverified_quotes: 1,
      refused: false,
    });
    const data = answer?.data as { text: string; sig: string };
    expect(data.text).toContain("The Act says");
    expect(data.text).toContain(BILL_CHAT_UNVERIFIED_PLACEHOLDER);
    expect(data.text).not.toContain("A widget is a device.");
    await expect(
      verifyAnswerSignature(secret, { bill: "119-hr-1", text: data.text }, data.sig)
    ).resolves.toBe(true);
    // The signature is bound to the bill the reader asked about, so it cannot
    // mint an `answer` quote on a different bill via POST /share/quote.
    await expect(
      verifyAnswerSignature(secret, { bill: "119-s-2", text: data.text }, data.sig)
    ).resolves.toBe(false);
    expect(chunks.some((c) => c.type === "text-start")).toBe(true);
    expect(chunks.some((c) => c.type === "text-end")).toBe(true);
  });

  it("writes an error chunk when the model stream throws", async () => {
    const env = createMockEnv();
    const response = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What is a widget?")] }),
      env: env as never,
      json,
      corsHeaders,
      deps: {
        loadEvidence: async () => ({ title: "Widget Act", digestRow: DIGEST_ROW, chunks: [SECTION] }),
        reserveUsage: okUsage(),
        resolveModel,
        streamText: async () => {
          throw new Error("provider down");
        },
      },
    });
    const chunks = await readSse(response);
    expect(chunks.some((c) => c.type === "error")).toBe(true);
  });

  it("turns a provider error reported via onError into an error chunk instead of signing an empty answer", async () => {
    const env = createMockEnv({ CHAT_HMAC_SECRET: "unit-test-hmac" });
    const response = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What is a widget?")] }),
      env: env as never,
      json,
      corsHeaders,
      deps: {
        loadEvidence: async () => ({ title: "Widget Act", digestRow: DIGEST_ROW, chunks: [SECTION] }),
        reserveUsage: okUsage(),
        resolveModel,
        streamText: async ({ onError }) => {
          // The SDK's textStream ends silently on provider failure; only onError fires.
          onError({ error: new Error("Upstream error from Nvidia: Service temporarily overloaded") });
          async function* empty() {}
          return { textStream: empty() };
        },
      },
    });
    const chunks = await readSse(response);
    expect(chunks.some((c) => c.type === "error")).toBe(true);
    expect(chunks.some((c) => c.type === "data-answer")).toBe(false);
  });

  it("treats an empty model answer as an error rather than a signed blank bubble", async () => {
    const env = createMockEnv({ CHAT_HMAC_SECRET: "unit-test-hmac" });
    const response = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What is a widget?")] }),
      env: env as never,
      json,
      corsHeaders,
      deps: {
        loadEvidence: async () => ({ title: "Widget Act", digestRow: DIGEST_ROW, chunks: [SECTION] }),
        reserveUsage: okUsage(),
        resolveModel,
        streamText: async () => {
          async function* blank() {
            yield "   ";
          }
          return { textStream: blank() };
        },
      },
    });
    const chunks = await readSse(response);
    expect(chunks.some((c) => c.type === "error")).toBe(true);
    expect(chunks.some((c) => c.type === "data-answer")).toBe(false);
  });

  it("routes the resolved model ahead of the curated free fallbacks with low-effort excluded reasoning", async () => {
    const env = createMockEnv();
    const streamText = vi.fn(async () => {
      async function* one() {
        yield "Answer.";
      }
      return { textStream: one() };
    });
    await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What is a widget?")] }),
      env: env as never,
      json,
      corsHeaders,
      deps: {
        loadEvidence: async () => ({ title: "Widget Act", digestRow: DIGEST_ROW, chunks: [SECTION] }),
        reserveUsage: okUsage(),
        resolveModel: async () => "vendor/model:free",
        streamText,
      },
    });
    const call = (streamText.mock.calls as unknown[][])[0]?.[0] as {
      providerOptions: { openrouter: { models: string[]; reasoning: unknown } };
      abortSignal?: AbortSignal;
    };
    expect(call.providerOptions.openrouter.models).toEqual(["vendor/model:free", ...CHAT_FALLBACK_MODELS]);
    expect(call.providerOptions.openrouter.reasoning).toEqual(CHAT_REASONING);
    expect(chatModelRoute(CHAT_FALLBACK_MODELS[0]!)).toEqual([...CHAT_FALLBACK_MODELS]);
    // Stop in the UI aborts the request; the model call must observe that signal.
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("ends the stream quietly when the reader aborts instead of writing an error part", async () => {
    const env = createMockEnv({ CHAT_HMAC_SECRET: "unit-test-hmac" });
    const response = await handleBillChat({
      request: post({ bill: "119-hr-1", messages: [userMessage("What is a widget?")] }),
      env: env as never,
      json,
      corsHeaders,
      deps: {
        loadEvidence: async () => ({ title: "Widget Act", digestRow: DIGEST_ROW, chunks: [SECTION] }),
        reserveUsage: okUsage(),
        resolveModel,
        streamText: async () => {
          async function* aborted() {
            yield "Partial ";
            throw new DOMException("The operation was aborted.", "AbortError");
          }
          return { textStream: aborted() };
        },
      },
    });
    const chunks = await readSse(response);
    expect(chunks.some((c) => c.type === "error")).toBe(false);
    expect(chunks.some((c) => c.type === "data-answer")).toBe(false);
  });
});

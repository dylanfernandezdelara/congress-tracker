import { describe, expect, it, vi } from "vitest";

import { signAnswer } from "../chat/answer-signature";
import { buildBillQuoteId } from "../d1/bill-quotes";
import type { DigestRow } from "../d1/digests";
import { buildJsonResponse } from "./responses";
import {
  BILL_QUOTES_PER_BILL_CAP,
  buildBillQuoteShareUrl,
  handleCreateBillQuote,
  handleGetBillQuote,
  quoteSourcesForBill,
  rateLimitKey,
} from "./share-quote";
import { createMockEnv } from "./test-fixtures";

const json = (body: unknown, init?: ResponseInit) => buildJsonResponse(body, {}, init);

const DIGEST: DigestRow = {
  congress: 119,
  bill_type: "HR",
  number: 4795,
  title: "Permitting Reform Act",
  policy_area: "Energy",
  raw_summary_text: "This bill directs the Secretary of Energy to accelerate transmission siting.",
  digest_json: JSON.stringify({
    headline: "House passes a permitting package",
    what_it_does: "Speeds energy permits and “smart” grid production across states.",
    key_points: ["Caps environmental review at two years"],
    terms_explained: [],
  }),
};

/** D1 stub: one digest row plus an in-memory bill_quotes table. */
function shareDb(
  digest: DigestRow | null = DIGEST,
  sections: Array<{ ordinal: number; label: string; heading: string; body: string }> = []
) {
  const quotes = new Map<string, Record<string, unknown>>();
  const db = {
    exec: vi.fn(async () => {}),
    prepare(sql: string) {
      const state = {
        args: [] as unknown[],
        bind: (...args: unknown[]) => {
          state.args = args;
          return state;
        },
        first: async () => {
          if (sql.includes("FROM bill_digests")) return digest;
          if (sql.includes("COUNT(*)") && sql.includes("bill_quotes")) {
            const [congress, billType, number] = state.args;
            let total = 0;
            for (const row of quotes.values()) {
              if (row.congress === congress && row.bill_type === billType && row.number === number) total += 1;
            }
            return { total };
          }
          if (sql.includes("FROM bill_quotes")) return quotes.get(String(state.args[0])) ?? null;
          if (sql.includes("FROM bill_text_documents")) {
            return sections.length > 0 ? { fetched_at: "2026-09-01T00:00:00.000Z" } : null;
          }
          return null;
        },
        all: async () => {
          if (sql.includes("FROM bill_text_sections")) return { results: sections };
          return { results: [] };
        },
        run: async () => {
          if (sql.includes("INSERT INTO bill_quotes")) {
            const [id, congress, billType, number, text, source, createdAt] = state.args;
            if (!quotes.has(String(id))) {
              quotes.set(String(id), {
                id,
                congress,
                bill_type: billType,
                number,
                text,
                source,
                created_at: createdAt,
              });
            }
          }
          return { success: true, meta: { changes: 1, duration: 0 } };
        },
      };
      return state;
    },
  } as unknown as D1Database;
  return { db, quotes };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://worker.example.com/share/quote", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /share/quote", () => {
  it("stores a verified digest quote and returns the canonical share URL", async () => {
    const { db, quotes } = shareDb();
    const env = createMockEnv({ DB: db });
    const text = "Speeds energy permits and “smart” grid production";
    const response = await handleCreateBillQuote({ request: post({ bill: "119-hr-4795", text }), env: env as never, json });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { quote: { id: string; source: string; text: string }; url: string };
    const expectedId = await buildBillQuoteId({ congress: 119, type: "HR", number: 4795 }, text);
    expect(body.quote.id).toBe(expectedId);
    expect(body.quote.source).toBe("digest");
    expect(body.quote.text).toBe(text);
    expect(body.url).toBe(`https://worker.example.com/?bill=119-hr-4795&quote=${expectedId}`);
    expect(quotes.size).toBe(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("verifies against the CRS summary and is idempotent across whitespace and case", async () => {
    const { db, quotes } = shareDb();
    const env = createMockEnv({ DB: db });
    const first = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "accelerate transmission siting" }),
      env: env as never,
      json,
    });
    const second = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "  Accelerate   TRANSMISSION siting " }),
      env: env as never,
      json,
    });
    const a = (await first.json()) as { quote: { id: string; source: string } };
    const b = (await second.json()) as { quote: { id: string } };
    expect(a.quote.source).toBe("crs");
    expect(a.quote.id).toBe(b.quote.id);
    expect(quotes.size).toBe(1);
  });

  it("rejects text that is not part of the bill", async () => {
    const env = createMockEnv({ DB: shareDb().db });
    const response = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "Something the bill never says at all" }),
      env: env as never,
      json,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "quote_not_in_bill" });
  });

  it("validates method, body, bill param, and length bounds", async () => {
    const env = createMockEnv({ DB: shareDb().db });
    const get = await handleCreateBillQuote({
      request: new Request("https://worker.example.com/share/quote"),
      env: env as never,
      json,
    });
    expect(get.status).toBe(405);

    const badJson = await handleCreateBillQuote({ request: post("{not json"), env: env as never, json });
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toMatchObject({ error: "bad_request" });

    const badBill = await handleCreateBillQuote({
      request: post({ bill: "hr-1", text: "Speeds energy permits and smart grid" }),
      env: env as never,
      json,
    });
    expect(badBill.status).toBe(400);

    const short = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "Speeds" }),
      env: env as never,
      json,
    });
    expect(await short.json()).toMatchObject({ error: "quote_too_short" });

    const long = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "x".repeat(300) }),
      env: env as never,
      json,
    });
    expect(await long.json()).toMatchObject({ error: "quote_too_long" });

    const oversized = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "x" }, { "content-length": "999999" }),
      env: env as never,
      json,
    });
    expect(oversized.status).toBe(400);
  });

  it("returns 404 for bills without a digest row", async () => {
    const env = createMockEnv({ DB: shareDb(null).db });
    const response = await handleCreateBillQuote({
      request: post({ bill: "119-hr-1", text: "Speeds energy permits and smart grid" }),
      env: env as never,
      json,
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "bill_not_found" });
  });

  it("refuses chat-answer quotes when the HMAC secret is unset", async () => {
    const env = createMockEnv({ DB: shareDb().db });
    const response = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "Speeds energy permits", answer: { text: "x", sig: "y" } }),
      env: env as never,
      json,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsupported_source" });
  });

  it("stores a signed chat-answer quote, rejects a bad signature, and refuses cross-bill replay", async () => {
    const secret = "share-test-hmac";
    const answerText = "The bill speeds energy permits across states in this package.";
    const sig = await signAnswer(secret, { bill: "119-hr-4795", text: answerText });
    const env = createMockEnv({ DB: shareDb().db, CHAT_HMAC_SECRET: secret });
    const ok = await handleCreateBillQuote({
      request: post({
        bill: "119-hr-4795",
        text: "speeds energy permits",
        answer: { text: answerText, sig },
      }),
      env: env as never,
      json,
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ quote: { source: "answer" } });

    const bad = await handleCreateBillQuote({
      request: post({
        bill: "119-hr-4795",
        text: "speeds energy permits",
        answer: { text: answerText, sig: "0".repeat(64) },
      }),
      env: env as never,
      json,
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "bad_request" });

    const missing = await handleCreateBillQuote({
      request: post({
        bill: "119-hr-4795",
        text: "something the answer never said",
        answer: { text: answerText, sig },
      }),
      env: env as never,
      json,
    });
    expect(missing.status).toBe(422);
    expect(await missing.json()).toMatchObject({ error: "quote_not_in_bill" });

    // The MAC binds the bill: a signature minted while chatting about H.R. 4795
    // cannot store the same prose as a quote on another bill.
    const otherBill = await handleCreateBillQuote({
      request: post({
        bill: "119-s-2",
        text: "speeds energy permits",
        answer: { text: answerText, sig },
      }),
      env: env as never,
      json,
    });
    expect(otherBill.status).toBe(400);
    expect(await otherBill.json()).toMatchObject({ error: "bad_request" });
  });

  it("verifies against stored bill-text sections after digest and CRS", async () => {
    const { db } = shareDb(DIGEST, [
      { ordinal: 0, label: "3.", heading: "Definitions", body: "A widget means a safety device under this Act." },
    ]);
    const env = createMockEnv({ DB: db });
    const response = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "a widget means a safety device" }),
      env: env as never,
      json,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ quote: { source: "bill_text" } });
  });

  it("returns the canonical production URL on production hosts", async () => {
    const env = createMockEnv({ DB: shareDb().db });
    const request = new Request("https://trackcongress.org/share/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bill: "119-hr-4795", text: "Caps environmental review at two years" }),
    });
    const response = await handleCreateBillQuote({ request, env: env as never, json });
    const body = (await response.json()) as { url: string };
    expect(body.url).toMatch(/^https:\/\/trackcongress\.org\/\?bill=119-hr-4795&quote=[0-9a-f]{16}$/);
  });

  it("caps distinct quotes per bill but still returns an existing quote at the cap", async () => {
    const { db, quotes } = shareDb();
    const env = createMockEnv({ DB: db });
    const text = "Caps environmental review at two years";
    const first = await handleCreateBillQuote({ request: post({ bill: "119-hr-4795", text }), env: env as never, json });
    expect(first.status).toBe(200);
    for (let i = 0; i < BILL_QUOTES_PER_BILL_CAP; i += 1) {
      quotes.set(`fill${i}`, { id: `fill${i}`, congress: 119, bill_type: "HR", number: 4795, text: `q${i}`, source: "digest", created_at: "" });
    }
    const capped = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "accelerate transmission siting" }),
      env: env as never,
      json,
    });
    expect(capped.status).toBe(429);
    expect(await capped.json()).toMatchObject({ error: "rate_limited" });
    const again = await handleCreateBillQuote({ request: post({ bill: "119-hr-4795", text }), env: env as never, json });
    expect(again.status).toBe(200);
  });

  it("returns 429 when the rate limiter denies and 503 (fail closed) when it throws", async () => {
    const denied = { limit: vi.fn(async () => ({ success: false })) };
    const env = createMockEnv({ DB: shareDb().db, SHARE_RATE_LIMITER: denied });
    const response = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "Speeds energy permits and smart grid" }, {
        "CF-Connecting-IP": "203.0.113.9",
      }),
      env: env as never,
      json,
    });
    expect(response.status).toBe(429);
    expect(denied.limit).toHaveBeenCalledWith({ key: "203.0.113.9" });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = { limit: vi.fn(async () => { throw new Error("binding down"); }) };
    const closedEnv = createMockEnv({ DB: shareDb().db, SHARE_RATE_LIMITER: broken });
    const closed = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text: "Speeds energy permits and “smart” grid" }),
      env: closedEnv as never,
      json,
    });
    expect(closed.status).toBe(503);
    expect(await closed.json()).toMatchObject({ error: "rate_limited" });
    warnSpy.mockRestore();
  });

  it("keys the limiter by connecting IP with an anonymous fallback", () => {
    expect(rateLimitKey(post({}, { "CF-Connecting-IP": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(rateLimitKey(post({}))).toBe("anonymous");
  });

  it("builds sources in digest-then-CRS-then-bill-text precedence", () => {
    expect(quoteSourcesForBill(DIGEST).map((s) => s.source)).toEqual(["digest", "crs"]);
    expect(
      quoteSourcesForBill(DIGEST, [
        { ordinal: 0, label: "Sec. 1.", heading: "Short title", body: "Section body for verification." },
      ]).map((s) => s.source)
    ).toEqual(["digest", "crs", "bill_text"]);
    expect(quoteSourcesForBill({ digest_json: null, raw_summary_text: null })).toEqual([]);
    expect(
      buildBillQuoteShareUrl({ congress: 119, type: "S", number: 2 }, "abcd1234abcd1234", "https://trackcongress.org")
    ).toBe("https://trackcongress.org/?bill=119-s-2&quote=abcd1234abcd1234");
  });
});

describe("GET /share/quote.json", () => {
  it("returns a stored quote and 404s/400s otherwise", async () => {
    const { db } = shareDb();
    const env = createMockEnv({ DB: db });
    const text = "Caps environmental review at two years";
    const created = await handleCreateBillQuote({
      request: post({ bill: "119-hr-4795", text }),
      env: env as never,
      json,
    });
    const { quote } = (await created.json()) as { quote: { id: string } };

    const found = await handleGetBillQuote({
      env: env as never,
      url: new URL(`https://worker.example.com/share/quote.json?id=${quote.id}`),
      json,
    });
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ quote: { id: quote.id, text, source: "digest" } });

    const missing = await handleGetBillQuote({
      env: env as never,
      url: new URL("https://worker.example.com/share/quote.json?id=0000000000000000"),
      json,
    });
    expect(missing.status).toBe(404);

    const malformed = await handleGetBillQuote({
      env: env as never,
      url: new URL("https://worker.example.com/share/quote.json?id=nope"),
      json,
    });
    expect(malformed.status).toBe(400);
  });
});

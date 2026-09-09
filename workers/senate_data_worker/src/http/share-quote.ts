import { formatBillQueryParam, parseBillQueryParam } from "../../../../shared/bill-id";
import {
  checkQuoteLength,
  cleanQuoteText,
  digestQuoteSourceText,
  findQuoteSource,
  type QuoteSourceText,
} from "../../../../shared/quote-verification";
import {
  BILL_QUOTE_MAX_CHARS,
  BILL_QUOTE_MIN_CHARS,
  BILL_QUOTE_QUERY_PARAM,
  type CreateBillQuoteError,
  type CreateBillQuoteRequest,
  type CreateBillQuoteResponse,
  type GetBillQuoteResponse,
} from "../../../../shared/share-api-types";
import { PRODUCTION_ORIGIN } from "../../../../shared/share-copy";
import type { Env } from "../config";
import { buildBillQuoteId, getBillQuote, insertBillQuote, isBillQuoteId } from "../d1/bill-quotes";
import { getDigest, parseStoredDigest } from "../d1/digests";
import { cacheLatest, cacheNoStore } from "./responses";

type JsonFn = (body: unknown, init?: ResponseInit) => Response;

/** Request bodies are tiny; anything larger is not a quote. */
const MAX_BODY_BYTES = 8 * 1024;

const NO_STORE = { "Cache-Control": cacheNoStore };

function errorResponse(
  json: JsonFn,
  status: number,
  error: CreateBillQuoteError,
  message: string
): Response {
  return json({ error, message }, { status, headers: NO_STORE });
}

export function buildBillQuoteShareUrl(
  bill: { congress: number; type: string; number: number },
  quoteId: string
): string {
  return `${PRODUCTION_ORIGIN}/?bill=${formatBillQueryParam(bill)}&${BILL_QUOTE_QUERY_PARAM}=${quoteId}`;
}

/** Client key for the burst limiter: Cloudflare's connecting IP, else a shared bucket. */
export function rateLimitKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || "anonymous";
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseCreateRequest(body: unknown): CreateBillQuoteRequest | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.bill !== "string" || typeof record.text !== "string") return null;
  const request: CreateBillQuoteRequest = { bill: record.bill, text: record.text };
  if (record.answer !== undefined) {
    if (!record.answer || typeof record.answer !== "object") return null;
    const answer = record.answer as Record<string, unknown>;
    if (typeof answer.text !== "string" || typeof answer.sig !== "string") return null;
    request.answer = { text: answer.text, sig: answer.sig };
  }
  return request;
}

/**
 * Verification sources a reader could have selected from, in precedence order.
 * Full bill text and signed chat answers are added by later PRs.
 */
export function quoteSourcesForBill(row: {
  digest_json: string | null;
  raw_summary_text: string | null;
}): QuoteSourceText[] {
  const sources: QuoteSourceText[] = [];
  const digest = parseStoredDigest(row.digest_json);
  const digestText = digestQuoteSourceText(digest);
  if (digestText) sources.push({ source: "digest", text: digestText });
  if (row.raw_summary_text?.trim()) sources.push({ source: "crs", text: row.raw_summary_text });
  return sources;
}

/**
 * `POST /share/quote` — public. Verifies the selection is verbatim bill content,
 * stores it under a content-derived id, and returns the canonical share URL.
 */
export async function handleCreateBillQuote(params: {
  request: Request;
  env: Env;
  json: JsonFn;
}): Promise<Response> {
  const { request, env, json } = params;
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: NO_STORE });
  }

  if (env.SHARE_RATE_LIMITER) {
    try {
      const outcome = await env.SHARE_RATE_LIMITER.limit({ key: rateLimitKey(request) });
      if (!outcome.success) {
        return errorResponse(
          json,
          429,
          "rate_limited",
          "Too many share links created. Wait a minute and try again."
        );
      }
    } catch (err: unknown) {
      // The limiter is a guard rail, not a dependency: fail open with a log line.
      console.warn("share_rate_limiter_unavailable", err);
    }
  }

  const body = parseCreateRequest(await readJsonBody(request));
  if (!body) {
    return errorResponse(json, 400, "bad_request", "Body must be JSON with `bill` and `text`.");
  }
  const bill = parseBillQueryParam(body.bill);
  if (!bill) {
    return errorResponse(json, 400, "bad_request", "`bill` must look like 119-hr-1.");
  }
  if (body.answer) {
    return errorResponse(
      json,
      400,
      "unsupported_source",
      "Sharing chat answers is not available yet."
    );
  }

  const text = cleanQuoteText(body.text);
  const length = checkQuoteLength(text);
  if (length === "too_short") {
    return errorResponse(
      json,
      400,
      "quote_too_short",
      `Select at least ${BILL_QUOTE_MIN_CHARS} characters to share a quote.`
    );
  }
  if (length === "too_long") {
    return errorResponse(
      json,
      400,
      "quote_too_long",
      `Quotes are limited to ${BILL_QUOTE_MAX_CHARS} characters.`
    );
  }

  const row = await getDigest(env.DB, bill.congress, bill.type, bill.number);
  if (!row) {
    return errorResponse(json, 404, "bill_not_found", "That bill is not in the feed yet.");
  }
  const source = findQuoteSource(text, quoteSourcesForBill(row));
  if (!source) {
    return errorResponse(
      json,
      422,
      "quote_not_in_bill",
      "That text is not part of this bill's summary, so it cannot be shared as a quote."
    );
  }

  const id = await buildBillQuoteId(bill, text);
  const quote = await insertBillQuote(env.DB, { id, bill, text, source });
  const response: CreateBillQuoteResponse = {
    quote,
    url: buildBillQuoteShareUrl(quote.bill, quote.id),
  };
  return json(response, { status: 200, headers: NO_STORE });
}

/** `GET /share/quote.json?id=` — public read used by the landing highlight. */
export async function handleGetBillQuote(params: {
  env: Env;
  url: URL;
  json: JsonFn;
}): Promise<Response> {
  const { env, url, json } = params;
  const id = url.searchParams.get("id")?.trim().toLowerCase() ?? "";
  if (!isBillQuoteId(id)) {
    return json({ error: "bad_request", message: "id is required" }, { status: 400, headers: NO_STORE });
  }
  const quote = await getBillQuote(env.DB, id);
  if (!quote) {
    return json({ error: "not_found", message: "quote not found" }, { status: 404, headers: NO_STORE });
  }
  const response: GetBillQuoteResponse = { quote };
  return json(response, { status: 200, headers: { "Cache-Control": cacheLatest } });
}

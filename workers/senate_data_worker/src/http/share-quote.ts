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
import type { Env } from "../config";
import {
  buildBillQuoteId,
  countBillQuotes,
  getBillQuote,
  insertBillQuote,
  isBillQuoteId,
} from "../d1/bill-quotes";
import { getBillText, type BillTextSectionRow } from "../d1/bill-text-sections";
import { getDigest, parseStoredDigest } from "../d1/digests";
import { publicShareOrigin } from "./bill-og";
import {
  NO_STORE_HEADERS,
  publicErrorResponse,
  rateLimitKey,
  readJsonBody,
  type JsonFn,
} from "./public-json";
import { cacheLatest } from "./responses";

export { rateLimitKey };

/** Request bodies are tiny; anything larger is not a quote. */
const MAX_BODY_BYTES = 8 * 1024;

/**
 * Hard bound on stored quotes per bill. Real readers share a handful of
 * passages; this caps table growth even if the burst limiter is bypassed.
 */
export const BILL_QUOTES_PER_BILL_CAP = 500;

const NO_STORE = NO_STORE_HEADERS;

const errorResponse = publicErrorResponse<CreateBillQuoteError>;

/**
 * Share URL on the origin that will actually resolve it: the canonical domain
 * for production hosts, the request's own origin for preview / local.
 */
export function buildBillQuoteShareUrl(
  bill: { congress: number; type: string; number: number },
  quoteId: string,
  origin: string
): string {
  return `${origin}/?bill=${formatBillQueryParam(bill)}&${BILL_QUOTE_QUERY_PARAM}=${quoteId}`;
}


function parseCreateRequest(body: unknown): CreateBillQuoteRequest | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.bill !== "string" || typeof record.text !== "string") return null;
  return { bill: record.bill, text: record.text };
}

/**
 * Verification sources a reader could have selected from, in precedence order
 * (digest → CRS → bill-text sections in ordinal order). Empty sources are
 * dropped.
 */
export function quoteSourcesForBill(
  row: {
    digest_json: string | null;
    raw_summary_text: string | null;
  },
  sections: BillTextSectionRow[] = []
): QuoteSourceText[] {
  const sources: QuoteSourceText[] = [
    {
      source: "digest",
      text: cleanQuoteText(digestQuoteSourceText(parseStoredDigest(row.digest_json))),
    },
    { source: "crs", text: cleanQuoteText(row.raw_summary_text ?? "") },
    ...[...sections]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((section): QuoteSourceText => ({
        source: "bill_text",
        text: cleanQuoteText(section.body),
      })),
  ];
  return sources.filter((entry) => entry.text);
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
    let allowed: boolean;
    try {
      allowed = (await env.SHARE_RATE_LIMITER.limit({ key: rateLimitKey(request) })).success;
    } catch (err: unknown) {
      // This is the only per-client bound on a public write path, so a limiter
      // outage pauses quote creation rather than opening it up.
      console.warn("share_rate_limiter_unavailable", err);
      return errorResponse(
        json,
        503,
        "rate_limited",
        "Sharing quotes is temporarily unavailable. Try again shortly."
      );
    }
    if (!allowed) {
      return errorResponse(
        json,
        429,
        "rate_limited",
        "Too many share links created. Wait a minute and try again."
      );
    }
  }

  const body = parseCreateRequest(await readJsonBody(request, MAX_BODY_BYTES));
  if (!body) {
    return errorResponse(json, 400, "bad_request", "Body must be JSON with `bill` and `text`.");
  }
  const bill = parseBillQueryParam(body.bill);
  if (!bill) {
    return errorResponse(json, 400, "bad_request", "`bill` must look like 119-hr-1.");
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

  const stored = await getBillText(env.DB, bill);
  const matched = findQuoteSource(text, quoteSourcesForBill(row, stored?.sections ?? []));
  if (!matched) {
    return errorResponse(
      json,
      422,
      "quote_not_in_bill",
      "That text is not part of this bill's summary, so it cannot be shared as a quote."
    );
  }

  const id = await buildBillQuoteId(bill, text);
  const existing = await getBillQuote(env.DB, id);
  if (!existing && (await countBillQuotes(env.DB, bill)) >= BILL_QUOTES_PER_BILL_CAP) {
    return errorResponse(
      json,
      429,
      "rate_limited",
      "This bill already has the maximum number of shared quotes."
    );
  }
  const quote = existing ?? (await insertBillQuote(env.DB, { id, bill, text, source: matched.source }));
  const response: CreateBillQuoteResponse = {
    quote,
    url: buildBillQuoteShareUrl(quote.bill, quote.id, publicShareOrigin(new URL(request.url))),
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

import { parseBillQueryParam } from "../../../../shared/bill-id";
import { SECURITY_HEADERS } from "../../../../shared/security-headers";
import {
  OG_DESCRIPTION_MAX_CHARS,
  PRODUCTION_ORIGIN,
  buildBillOgFields,
  buildShareCopy,
  parseShareDigestJson,
} from "../../../../shared/share-copy";
import { ogCardImagePath, ogCardVersion, type OgCardModel } from "../../../../shared/og-card";
import { quoteBelongsToBill } from "../../../../shared/quote-verification";
import { BILL_QUOTE_QUERY_PARAM, type BillQuote } from "../../../../shared/share-api-types";
import type { Env } from "../config";
import { getBillQuote, isBillQuoteId } from "../d1/bill-quotes";
import { getDigest, type DigestRow } from "../d1/digests";
import { loadOgCardModel } from "./og-card-model";
import { isProductionPipelineHost } from "./pipeline-auth";

export { OG_DESCRIPTION_MAX_CHARS, PRODUCTION_ORIGIN };
export const BILL_OG_CACHE_CONTROL = "public, max-age=300";

export type ShareMetaFields = {
  title: string;
  description: string;
  url: string;
  /** Absolute PNG URL for og:image / twitter:image; omitted keeps the static site card. */
  image?: string;
  imageAlt?: string;
};

/**
 * Origin for share URLs and the dynamic card PNG. Production custom domains use
 * the canonical origin; preview / workers.dev / local keep their own host so a
 * preview share link resolves and a crawler fetches the preview's image.
 */
export function publicShareOrigin(url: URL): string {
  return isProductionPipelineHost(url.hostname) ? PRODUCTION_ORIGIN : url.origin;
}

export function ogImageFields(
  bill: { congress: number; type: string; number: number },
  model: OgCardModel,
  quote: BillQuote | null,
  imageOrigin: string
): Pick<ShareMetaFields, "image" | "imageAlt"> {
  const path = ogCardImagePath(bill, {
    quoteId: quote?.id ?? null,
    version: ogCardVersion(model),
  });
  return {
    image: `${imageOrigin}${path}`,
    imageAlt: quote
      ? `“${quote.text}” — ${model.docket}, ${model.status_line}`
      : `${model.headline} — ${model.docket}, ${model.status_line}`,
  };
}

const SPA_SHELL_PATHS = new Set(["/", "/index.html"]);

export function acceptPrefersHtml(accept: string | null): boolean {
  if (accept == null || accept.trim() === "" || accept.trim() === "*/*") {
    return true;
  }
  const htmlQ = acceptQuality(accept, "text/html");
  const jsonQ = acceptQuality(accept, "application/json");
  if (htmlQ == null && jsonQ == null) return false;
  return (htmlQ ?? 0) >= (jsonQ ?? 0) && (htmlQ ?? 0) > 0;
}

function acceptQuality(accept: string, type: string): number | null {
  const parts = accept.split(",").map((part) => part.trim());
  for (const part of parts) {
    const [media, ...params] = part.split(";").map((bit) => bit.trim());
    if (!media) continue;
    const match =
      media.toLowerCase() === type ||
      media === "*/*" ||
      (type.startsWith("text/") && media.toLowerCase() === "text/*");
    if (!match) continue;
    const qParam = params.find((param) => param.toLowerCase().startsWith("q="));
    const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
    return Number.isFinite(q) ? q : 1;
  }
  return null;
}

export function isBillOgDocumentRequest(request: Request, url: URL): boolean {
  if (request.method !== "GET") return false;
  if (!SPA_SHELL_PATHS.has(url.pathname)) return false;
  if (!url.searchParams.get("bill")?.trim()) return false;
  return acceptPrefersHtml(request.headers.get("Accept"));
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceOnce(
  html: string,
  pattern: RegExp,
  inject: (prefix: string, suffix: string) => string
): string | null {
  const match = pattern.exec(html);
  if (!match?.[1] || match[2] == null) return null;
  return html.replace(pattern, (_full, prefix: string, suffix: string) => inject(prefix, suffix));
}

function replaceMeta(
  html: string,
  kind: "property" | "name",
  key: string,
  value: string
): string | null {
  const escaped = escapeHtmlAttr(value);
  const quotedKey = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `(<meta\\s+[^>]*${kind}="${quotedKey}"[^>]*\\scontent=")[^"]*(")`,
      "i"
    ),
    new RegExp(
      `(<meta\\s+[^>]*content=")[^"]*("[^>]*\\s${kind}="${quotedKey}")`,
      "i"
    ),
  ];
  for (const pattern of patterns) {
    const next = replaceOnce(html, pattern, (prefix, suffix) => `${prefix}${escaped}${suffix}`);
    if (next !== null) return next;
  }
  return null;
}

function replaceCanonical(html: string, url: string): string | null {
  const escaped = escapeHtmlAttr(url);
  return replaceOnce(
    html,
    /(<link\s+[^>]*rel="canonical"[^>]*href=")[^"]*(")/i,
    (prefix, suffix) => `${prefix}${escaped}${suffix}`
  );
}

function replaceDocumentTitle(html: string, title: string): string | null {
  const escaped = escapeHtmlAttr(title);
  return replaceOnce(
    html,
    /(<title>)[\s\S]*?(<\/title>)/i,
    (prefix, suffix) => `${prefix}${escaped}${suffix}`
  );
}

export function rewriteShareMeta(html: string, fields: ShareMetaFields): string {
  const imageSteps: Array<[string, (current: string) => string | null]> =
    fields.image !== undefined
      ? [
          ["og:image", (current) => replaceMeta(current, "property", "og:image", fields.image!)],
          [
            "og:image:alt",
            (current) =>
              replaceMeta(current, "property", "og:image:alt", fields.imageAlt ?? fields.title),
          ],
          ["twitter:image", (current) => replaceMeta(current, "name", "twitter:image", fields.image!)],
        ]
      : [];
  const steps: Array<[string, (current: string) => string | null]> = [
    ...imageSteps,
    ["og:title", (current) => replaceMeta(current, "property", "og:title", fields.title)],
    [
      "og:description",
      (current) => replaceMeta(current, "property", "og:description", fields.description),
    ],
    ["og:url", (current) => replaceMeta(current, "property", "og:url", fields.url)],
    ["twitter:title", (current) => replaceMeta(current, "name", "twitter:title", fields.title)],
    [
      "twitter:description",
      (current) => replaceMeta(current, "name", "twitter:description", fields.description),
    ],
    ["canonical", (current) => replaceCanonical(current, fields.url)],
    ["title", (current) => replaceDocumentTitle(current, fields.title)],
  ];
  let next = html;
  const missing: string[] = [];
  for (const [label, apply] of steps) {
    const result = apply(next);
    if (result === null) missing.push(label);
    else next = result;
  }
  if (missing.length > 0) {
    throw new Error(`bill OG rewrite missed tags: ${missing.join(", ")}`);
  }
  return next;
}

export function ogFieldsFromDigest(
  row: DigestRow | null,
  bill: { congress: number; type: string; number: number },
  quote: BillQuote | null = null
): ShareMetaFields | null {
  if (!row) return null;
  const parsed = parseShareDigestJson(row.digest_json);
  const copy = buildShareCopy({
    headline: parsed.headline,
    whatItDoes: parsed.whatItDoes,
    crsSummary: row.raw_summary_text,
    title: row.title,
    bill,
  });
  if (!copy.title && !copy.text) return null;
  const fields = buildBillOgFields(copy, bill);
  if (!quote) return fields;
  return {
    ...fields,
    description: `“${quote.text}”`,
    url: `${fields.url}&${BILL_QUOTE_QUERY_PARAM}=${quote.id}`,
  };
}

/** Stored quote for `?quote=` when it exists and belongs to this bill; else null. */
export async function resolveSharedQuote(
  env: Env,
  url: URL,
  bill: { congress: number; type: string; number: number }
): Promise<BillQuote | null> {
  const raw = url.searchParams.get(BILL_QUOTE_QUERY_PARAM)?.trim().toLowerCase();
  if (!isBillQuoteId(raw)) return null;
  const quote = await getBillQuote(env.DB, raw);
  return quote && quoteBelongsToBill(quote, bill) ? quote : null;
}

function billOgHeaders(shell: Response): Headers {
  const headers = new Headers(shell.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", BILL_OG_CACHE_CONTROL);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}

/**
 * Rewrites SPA shell OG/Twitter tags for `/?bill=` document navigations.
 * Returns null when this request should fall through to ASSETS unchanged.
 */
export async function tryRewriteBillOg(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isBillOgDocumentRequest(request, url)) return null;
  if (!env.ASSETS) return null;

  const shellRequest = new Request(new URL("/", url.origin), {
    method: "GET",
    headers: request.headers,
  });
  const shell = await env.ASSETS.fetch(shellRequest);
  const contentType = shell.headers.get("content-type") ?? "";
  if (!shell.ok || !contentType.includes("text/html")) {
    return shell;
  }

  const parsed = parseBillQueryParam(url.searchParams.get("bill"));
  if (!parsed) return shell;

  const row = await getDigest(env.DB, parsed.congress, parsed.type, parsed.number);
  if (!row) return shell;
  const quote = await resolveSharedQuote(env, url, parsed);
  let fields = ogFieldsFromDigest(row, parsed, quote);
  if (!fields) return shell;

  // The dynamic card is an enhancement: any model failure keeps the static image.
  try {
    const card = await loadOgCardModel(env, parsed, quote?.id ?? null, {
      digestRow: row,
      quote,
    });
    if (card.ok) {
      fields = { ...fields, ...ogImageFields(parsed, card.model, quote, publicShareOrigin(url)) };
    }
  } catch (err: unknown) {
    console.warn("bill_og_card_model_failed", err);
  }

  const shellHtml = await shell.text();
  try {
    const html = rewriteShareMeta(shellHtml, fields);
    return new Response(html, {
      status: shell.status,
      headers: billOgHeaders(shell),
    });
  } catch {
    return new Response(shellHtml, { status: shell.status, headers: shell.headers });
  }
}

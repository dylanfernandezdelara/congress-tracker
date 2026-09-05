import {
  formatBillQueryParam,
  parseBillQueryParam,
} from "../../../../shared/bill-id";
import { truncateAtSentenceBoundary } from "../../../../shared/digest-format";
import type { Env } from "../config";
import { getDigest, type DigestRow } from "../d1/digests";

export const PRODUCTION_ORIGIN = "https://trackcongress.org";
export const OG_DESCRIPTION_MAX_CHARS = 180;
export const BILL_OG_CACHE_CONTROL = "public, max-age=300";

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

function replaceMeta(
  html: string,
  kind: "property" | "name",
  key: string,
  value: string
): string {
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
    if (pattern.test(html)) {
      return html.replace(pattern, `$1${escaped}$2`);
    }
  }
  return html;
}

function replaceCanonical(html: string, url: string): string {
  const escaped = escapeHtmlAttr(url);
  const pattern = /(<link\s+[^>]*rel="canonical"[^>]*href=")[^"]*(")/i;
  if (pattern.test(html)) {
    return html.replace(pattern, `$1${escaped}$2`);
  }
  return html;
}

export function rewriteShareMeta(
  html: string,
  fields: { title: string; description: string; url: string }
): string {
  let next = html;
  next = replaceMeta(next, "property", "og:title", fields.title);
  next = replaceMeta(next, "property", "og:description", fields.description);
  next = replaceMeta(next, "property", "og:url", fields.url);
  next = replaceMeta(next, "name", "twitter:title", fields.title);
  next = replaceMeta(next, "name", "twitter:description", fields.description);
  next = replaceCanonical(next, fields.url);
  return next;
}

export function ogFieldsFromDigest(
  row: DigestRow | null,
  bill: { congress: number; type: string; number: number }
): { title: string; description: string; url: string } | null {
  if (!row) return null;
  let headline: string | null = null;
  let whatItDoes: string | null = null;
  if (row.digest_json) {
    try {
      const parsed = JSON.parse(row.digest_json) as {
        headline?: unknown;
        what_it_does?: unknown;
      };
      if (typeof parsed.headline === "string" && parsed.headline.trim()) {
        headline = parsed.headline.trim();
      }
      if (typeof parsed.what_it_does === "string" && parsed.what_it_does.trim()) {
        whatItDoes = parsed.what_it_does.trim();
      }
    } catch {
      // Keep title-only fallbacks below.
    }
  }
  const title = headline || row.title?.trim() || null;
  const description = whatItDoes || row.title?.trim() || title;
  if (!title && !description) return null;
  return {
    title: title || "Track Congress",
    description: truncateAtSentenceBoundary(description || title || "", OG_DESCRIPTION_MAX_CHARS),
    url: `${PRODUCTION_ORIGIN}/?bill=${formatBillQueryParam(bill)}`,
  };
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
  const fields = ogFieldsFromDigest(row, parsed);
  if (!fields) return shell;

  const html = rewriteShareMeta(await shell.text(), fields);
  return new Response(html, {
    status: shell.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": BILL_OG_CACHE_CONTROL,
    },
  });
}

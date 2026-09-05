import { parseBillQueryParam } from "../../../../shared/bill-id";
import { SECURITY_HEADERS } from "../../../../shared/security-headers";
import {
  OG_DESCRIPTION_MAX_CHARS,
  PRODUCTION_ORIGIN,
  buildBillOgFields,
  buildShareCopy,
  parseShareDigestJson,
} from "../../../../shared/share-copy";
import type { Env } from "../config";
import { getDigest, type DigestRow } from "../d1/digests";

export { OG_DESCRIPTION_MAX_CHARS, PRODUCTION_ORIGIN };
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

function replaceOnce(html: string, pattern: RegExp, replacement: string): string | null {
  if (!pattern.test(html)) return null;
  return html.replace(pattern, replacement);
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
    const next = replaceOnce(html, pattern, `$1${escaped}$2`);
    if (next !== null) return next;
  }
  return null;
}

function replaceCanonical(html: string, url: string): string | null {
  const escaped = escapeHtmlAttr(url);
  return replaceOnce(
    html,
    /(<link\s+[^>]*rel="canonical"[^>]*href=")[^"]*(")/i,
    `$1${escaped}$2`
  );
}

function replaceDocumentTitle(html: string, title: string): string | null {
  return replaceOnce(html, /(<title>)[\s\S]*?(<\/title>)/i, `$1${escapeHtmlAttr(title)}$2`);
}

export function rewriteShareMeta(
  html: string,
  fields: { title: string; description: string; url: string }
): string {
  const steps: Array<[string, (current: string) => string | null]> = [
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
  bill: { congress: number; type: string; number: number }
): { title: string; description: string; url: string } | null {
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
  return buildBillOgFields(copy, bill);
}

function billOgHeaders(shell: Response): Headers {
  const headers = new Headers(shell.headers);
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
  const fields = ogFieldsFromDigest(row, parsed);
  if (!fields) return shell;

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

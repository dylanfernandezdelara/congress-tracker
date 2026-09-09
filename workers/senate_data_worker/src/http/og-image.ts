import { parseBillQueryParam } from "../../../../shared/bill-id";
import { BILL_QUOTE_QUERY_PARAM } from "../../../../shared/share-api-types";
import type { Env } from "../config";
import { buildOgCardHtml } from "./og-card-html";
import { loadOgCardModel } from "./og-card-model";
import type { OgRenderer } from "./og-render";

export const OG_IMAGE_CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, immutable";
export const OG_IMAGE_FALLBACK_CACHE_CONTROL = "public, max-age=300";

const QUOTE_ID_RE = /^[0-9a-f]{8,32}$/;
const OG_PATH_RE = /^\/og\/bill\/([^/]+)\.png$/;

/** 1×1 transparent PNG so crawlers never receive HTML when assets are missing. */
const TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export type OgImageRouteDeps = {
  render?: OgRenderer;
  loadModel?: typeof loadOgCardModel;
  cache?: Cache;
};

function plainText(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function decodeBase64Bytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function fallbackHeaders(): Headers {
  const headers = new Headers();
  headers.set("content-type", "image/png");
  headers.set("cache-control", OG_IMAGE_FALLBACK_CACHE_CONTROL);
  headers.set("x-og-card", "fallback");
  return headers;
}

function transparentPngResponse(): Response {
  return new Response(decodeBase64Bytes(TRANSPARENT_PNG_BASE64), {
    status: 200,
    headers: fallbackHeaders(),
  });
}

async function staticFallbackResponse(env: Env, url: URL): Promise<Response> {
  try {
    const asset = await env.ASSETS?.fetch(new Request(new URL("/og-image.png", url.origin)));
    if (asset?.ok) {
      return new Response(asset.body, { status: 200, headers: fallbackHeaders() });
    }
  } catch {
    // Fall through to the hardcoded pixel — crawlers must still get a PNG.
  }
  return transparentPngResponse();
}

/** Workers' `caches.default`; undefined outside the Workers runtime (unit tests). */
function edgeCache(): Cache | undefined {
  const scope = globalThis as { caches?: { default?: Cache } };
  return scope.caches?.default;
}

async function defaultRender(html: string): Promise<Response> {
  const { renderOgCardPng } = await import("./og-render");
  return renderOgCardPng(html);
}

/** `/og/bill/<billParam>.png` → billParam (`119-hr-1`), or null. */
export function parseOgImagePath(pathname: string): string | null {
  const match = OG_PATH_RE.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function parseQuoteId(raw: string | null): string | null {
  if (!raw || !QUOTE_ID_RE.test(raw)) return null;
  return raw;
}

/**
 * GET `/og/bill/:bill.png` — rendered tally card, Cache API, static PNG fallback.
 */
export async function handleOgImageRoute(params: {
  request: Request;
  env: Env;
  url: URL;
  ctx?: Pick<ExecutionContext, "waitUntil">;
  deps?: OgImageRouteDeps;
}): Promise<Response> {
  const { request, env, url, ctx, deps } = params;
  if (request.method !== "GET") {
    return plainText(405, "Method Not Allowed");
  }

  const billParam = parseOgImagePath(url.pathname);
  const bill = billParam ? parseBillQueryParam(billParam) : null;
  if (!bill) {
    return plainText(404, "Not Found");
  }

  const quoteId = parseQuoteId(url.searchParams.get(BILL_QUOTE_QUERY_PARAM));
  const cache = deps?.cache ?? edgeCache();
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = cache ? await cache.match(cacheKey) : undefined;
  if (cached) return cached;

  const loadModel = deps?.loadModel ?? loadOgCardModel;
  const render = deps?.render ?? defaultRender;

  try {
    const loaded = await loadModel(env, bill, quoteId);
    if (!loaded.ok) {
      return staticFallbackResponse(env, url);
    }

    const rendered = await render(buildOgCardHtml(loaded.model));
    const response = new Response(rendered.body, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": OG_IMAGE_CACHE_CONTROL,
        "x-og-card": "rendered",
      },
    });
    if (cache) {
      const put = cache.put(cacheKey, response.clone());
      if (ctx?.waitUntil) ctx.waitUntil(put);
      else await put;
    }
    return response;
  } catch (err: unknown) {
    console.error("og_image_render_failed", err);
    return staticFallbackResponse(env, url);
  }
}

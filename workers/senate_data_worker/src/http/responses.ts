import type { Env } from "../config";
import { SECURITY_HEADERS } from "../../../../shared/security-headers";

export type JsonResponseBuilder = (body: unknown, init?: ResponseInit) => Response;

export const cacheHealth = "s-maxage=60, max-age=0, must-revalidate";
export const cacheLatest = "s-maxage=300, stale-while-revalidate=86400";
export const cacheNoStore = "no-store";

/** Baseline hardening for Worker JSON responses (static assets use web/public/_headers). */
export const securityHeaders: Record<string, string> = { ...SECURITY_HEADERS };

/** Parse ALLOWED_ORIGIN as `*`, a single origin, or a comma/whitespace-separated allowlist. */
export function parseAllowedOrigins(raw: string | undefined): "*" | string[] | null {
  const allowedOrigin = raw?.trim();
  if (!allowedOrigin) return null;
  if (allowedOrigin === "*") return "*";
  const list = allowedOrigin.split(/[\s,]+/).filter(Boolean);
  return list.length > 0 ? list : null;
}

/**
 * CORS headers for the public read API and admin POST preflight.
 * When multiple origins are configured, reflects the request Origin if it matches.
 */
export function buildCorsHeaders(
  env: Pick<Env, "ALLOWED_ORIGIN">,
  requestOrigin?: string | null
): HeadersInit {
  const parsed = parseAllowedOrigins(env.ALLOWED_ORIGIN);
  if (parsed === null || parsed === "*") {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }

  const fallback = parsed[0];
  if (!fallback) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }
  const matched =
    requestOrigin && parsed.includes(requestOrigin) ? requestOrigin : fallback;
  return {
    "Access-Control-Allow-Origin": matched,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

export function buildJsonResponse(
  body: unknown,
  corsHeaders: HeadersInit,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...securityHeaders,
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

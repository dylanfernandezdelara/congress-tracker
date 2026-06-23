import type { Env } from "../config";

export type JsonResponseBuilder = (body: unknown, init?: ResponseInit) => Response;

export const cacheHealth = "s-maxage=60, max-age=0, must-revalidate";
export const cacheLatest = "s-maxage=300, stale-while-revalidate=86400";
export const cacheNoStore = "no-store";

/** CORS headers for the public read API and admin POST preflight. */
export function buildCorsHeaders(env: Pick<Env, "ALLOWED_ORIGIN">): HeadersInit {
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim();
  const restrictedOrigin = allowedOrigin && allowedOrigin !== "*" ? allowedOrigin : null;
  const headers: HeadersInit = {
    "Access-Control-Allow-Origin": restrictedOrigin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (restrictedOrigin) headers["Vary"] = "Origin";
  return headers;
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
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

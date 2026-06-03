import type { PipelineEnv } from "../pipeline-env";

export type JsonResponseBuilder = (body: unknown, init?: ResponseInit) => Response;

export const cacheHealth = "s-maxage=60, max-age=0, must-revalidate";
export const cacheLatest = "s-maxage=300, stale-while-revalidate=86400";

/**
 * CORS headers for the unified worker. The worker serves the public read API
 * (GET) and the token-gated /__pipeline/* admin routes (GET/POST), so the
 * allowed methods/headers cover both. Admin routes are protected by the token
 * check, not by CORS.
 */
export function buildCorsHeaders(env: Pick<PipelineEnv, "ALLOWED_ORIGIN">): HeadersInit {
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim();
  const restrictedOrigin = allowedOrigin && allowedOrigin !== "*" ? allowedOrigin : null;
  const headers: HeadersInit = {
    "Access-Control-Allow-Origin": restrictedOrigin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Pipeline-Admin-Token",
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

import { type Env } from "../config";
import {
  buildCorsHeaders,
  buildJsonResponse,
  cacheHealth,
  cacheLatest,
} from "./responses";

const NOT_IMPLEMENTED = {
  error: "not_implemented",
  message: "Worker storage and ingestion are being redesigned from scratch.",
} as const;

function healthResponse(env: Env, json: (body: unknown, init?: ResponseInit) => Response): Response {
  return json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      target_state: env.TARGET_STATE,
      congress: env.CONGRESS,
      session: env.SESSION,
    },
    { status: 200, headers: { "Cache-Control": cacheHealth } }
  );
}

/**
 * Public read API: /health, /health/data, /briefings/latest.json, /votes/:c/:s/:n.json.
 */
export async function handlePublicFetch(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const corsHeaders = buildCorsHeaders(env);
  const json = (body: unknown, init?: ResponseInit) => buildJsonResponse(body, corsHeaders, init);
  const notFound = (path: string) =>
    json({ error: "not_found", message: "Resource not found", path }, { status: 404 });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return json({ error: "method_not_allowed", message: "Only GET requests are allowed" }, { status: 405 });
  }

  if (pathname === "/health") {
    return healthResponse(env, json);
  }

  if (pathname === "/health/data") {
    return json(
      { status: "stale", message: NOT_IMPLEMENTED.message },
      { status: 503, headers: { "Cache-Control": cacheHealth } }
    );
  }

  if (pathname === "/briefings/latest.json") {
    return json(NOT_IMPLEMENTED, { status: 503, headers: { "Cache-Control": cacheLatest } });
  }

  if (pathname.match(/^\/votes\/\d+\/\d+\/\d+\.json$/)) {
    return json(NOT_IMPLEMENTED, { status: 503, headers: { "Cache-Control": cacheLatest } });
  }

  return notFound(pathname);
}

/** HTTP entry for the unified worker. */
export async function handleFetch(request: Request, env: Env): Promise<Response> {
  return handlePublicFetch(request, env);
}

import { type Env } from "../config";
import { runFeedPipeline } from "../pipeline/run-feed";
import { buildFeed } from "../storage/feed";
import {
  buildCorsHeaders,
  buildJsonResponse,
  cacheHealth,
  cacheLatest,
} from "./responses";

function healthResponse(env: Env, json: (body: unknown, init?: ResponseInit) => Response): Response {
  return json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      congress: env.CONGRESS,
      session: env.SESSION,
    },
    { status: 200, headers: { "Cache-Control": cacheHealth } }
  );
}

function authorizePipeline(request: Request, env: Env): boolean {
  const token = env.PIPELINE_ADMIN_TOKEN?.trim();
  if (!token) return true;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  const auth = request.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return queryToken === token || bearer === token;
}

/**
 * Public read API: /health, /feed/latest.json.
 * Admin: /__pipeline/run/feed
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

  if (pathname === "/__pipeline/run/feed") {
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, { status: 405 });
    }
    if (!authorizePipeline(request, env)) {
      return json({ error: "unauthorized" }, { status: 401 });
    }
    try {
      const result = await runFeedPipeline(env);
      return json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "pipeline failed";
      return json({ ok: false, error: message }, { status: 500 });
    }
  }

  if (request.method !== "GET") {
    return json({ error: "method_not_allowed", message: "Only GET requests are allowed" }, { status: 405 });
  }

  if (pathname === "/health") {
    return healthResponse(env, json);
  }

  if (pathname === "/feed/latest.json") {
    try {
      const feed = await buildFeed(env);
      return json(feed, {
        status: 200,
        headers: { "Cache-Control": cacheLatest },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "feed unavailable";
      return json({ error: "feed_error", message }, { status: 500 });
    }
  }

  return notFound(pathname);
}

/** HTTP entry for the unified worker. */
export async function handleFetch(request: Request, env: Env): Promise<Response> {
  return handlePublicFetch(request, env);
}

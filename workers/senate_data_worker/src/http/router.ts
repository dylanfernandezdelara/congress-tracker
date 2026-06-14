import { type Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { computeDefectors } from "../analytics/defectors";
import { buildPortfolioMovers } from "../d1/disclosures";
import { runDisclosuresPipeline } from "../pipeline/run-disclosures";
import { runFeedPipeline } from "../pipeline/run-feed";
import { runMemberVotesPipeline } from "../pipeline/run-member-votes";
import { runSessionBackfillPipeline } from "../pipeline/run-session-backfill";
import { buildFeed } from "../storage/feed";
import { buildPulseStats } from "../storage/pulse-stats";
import { buildSessionStats } from "../storage/session-stats";
import type { Chamber } from "../types";
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

function parseChamber(value: string | null): Chamber | null {
  if (value === "House" || value === "Senate") return value;
  return null;
}

async function handlePipelineRoute(
  request: Request,
  env: Env,
  json: (body: unknown, init?: ResponseInit) => Response,
  run: () => Promise<unknown>
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, { status: 405 });
  }
  if (!authorizePipeline(request, env)) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await run();
    return json({ ok: true, ...((result as object) ?? {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "pipeline failed";
    return json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * Public read API: /health, /feed/latest.json, /stats/*.
 * Admin: /__pipeline/run/*
 */
export async function handlePublicFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const corsHeaders = buildCorsHeaders(env);
  const json = (body: unknown, init?: ResponseInit) => buildJsonResponse(body, corsHeaders, init);
  const notFound = (path: string) =>
    json({ error: "not_found", message: "Resource not found", path }, { status: 404 });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (pathname === "/__pipeline/run/feed") {
    return handlePipelineRoute(request, env, json, () => runFeedPipeline(env));
  }

  if (pathname === "/__pipeline/run/session-backfill") {
    return handlePipelineRoute(request, env, json, () => runSessionBackfillPipeline(env));
  }

  if (pathname === "/__pipeline/run/member-votes") {
    return handlePipelineRoute(request, env, json, () => runMemberVotesPipeline(env));
  }

  if (pathname === "/__pipeline/run/disclosures") {
    return handlePipelineRoute(request, env, json, () => runDisclosuresPipeline(env));
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

  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const asOf = new Date().toISOString();

  if (pathname === "/stats/session.json") {
    try {
      const stats = await buildSessionStats(env.DB, congress, session);
      return json(
        { congress, session, ...stats, as_of: asOf },
        { status: 200, headers: { "Cache-Control": cacheLatest } }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "session stats unavailable";
      return json({ error: "stats_error", message }, { status: 500 });
    }
  }

  if (pathname === "/stats/pulse.json") {
    try {
      const pulse = await buildPulseStats(env.DB, congress, session);
      return json(
        { congress, session, ...pulse, as_of: asOf },
        { status: 200, headers: { "Cache-Control": cacheLatest } }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "pulse stats unavailable";
      return json({ error: "stats_error", message }, { status: 500 });
    }
  }

  if (pathname === "/stats/defectors.json") {
    const chamber = parseChamber(url.searchParams.get("chamber"));
    if (!chamber) {
      return json({ error: "bad_request", message: "chamber must be House or Senate" }, { status: 400 });
    }
    const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "5", 10) || 5));
    try {
      const defectors = await computeDefectors(env.DB, congress, session, chamber, limit);
      return json(
        { chamber, congress, session, defectors, as_of: asOf },
        { status: 200, headers: { "Cache-Control": cacheLatest } }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "defectors unavailable";
      return json({ error: "stats_error", message }, { status: 500 });
    }
  }

  if (pathname === "/stats/portfolios.json") {
    const chamber = parseChamber(url.searchParams.get("chamber"));
    if (!chamber) {
      return json({ error: "bad_request", message: "chamber must be House or Senate" }, { status: 400 });
    }
    const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "5", 10) || 5));
    try {
      const movers = await buildPortfolioMovers(env.DB, chamber, limit);
      return json(
        { chamber, congress, session, ...movers, as_of: asOf },
        { status: 200, headers: { "Cache-Control": cacheLatest } }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "portfolio stats unavailable";
      return json({ error: "stats_error", message }, { status: 500 });
    }
  }

  if (env.ASSETS && !isApiPath(pathname)) {
    return env.ASSETS.fetch(request);
  }

  return notFound(pathname);
}

const API_PATH_PREFIXES = ["/health", "/feed/", "/stats/", "/__pipeline/"];

function isApiPath(pathname: string): boolean {
  return API_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/** HTTP entry for the unified worker. */
export async function handleFetch(request: Request, env: Env): Promise<Response> {
  return handlePublicFetch(request, env);
}

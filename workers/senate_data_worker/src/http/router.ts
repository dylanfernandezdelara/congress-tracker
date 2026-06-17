import { type Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { computeDefectors } from "../analytics/defectors";
import { buildPortfolioMovers } from "../d1/disclosures";
import { runDisclosuresPipeline } from "../pipeline/run-disclosures";
import { runFeedPipeline } from "../pipeline/run-feed";
import { runMemberVotesPipeline } from "../pipeline/run-member-votes";
import { runSessionBackfillPipeline } from "../pipeline/run-session-backfill";
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_BILLS, FEED_MAX_PAGE_SIZE } from "../constants";
import { buildFeedPage } from "../storage/feed";
import { buildPulseStats } from "../storage/pulse-stats";
import { buildSessionStats } from "../storage/session-stats";
import type {
  Chamber,
  DefectorsResponse,
  PortfoliosResponse,
  PulseStatsResponse,
  SessionStatsResponse,
} from "../types";
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
  if (token) {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token");
    const auth = request.headers.get("Authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    return queryToken === token || bearer === token;
  }
  // No admin token configured: only allow these write pipelines in explicit
  // local/dev mode (ALLOWED_ORIGIN="*"). Production sets a specific origin (or
  // leaves it unset), so it fails closed instead of exposing the routes — they
  // hit upstream APIs and write to the shared production D1.
  return env.ALLOWED_ORIGIN?.trim() === "*";
}

function parseChamber(value: string | null): Chamber | null {
  if (value === "House" || value === "Senate") return value;
  return null;
}

function parseStatsLimit(url: URL, fallback = 5): number {
  return Math.min(
    20,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? String(fallback), 10) || fallback)
  );
}

function parseFeedLimit(url: URL): number {
  return Math.min(
    FEED_MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? String(FEED_DEFAULT_PAGE_SIZE), 10) || FEED_DEFAULT_PAGE_SIZE)
  );
}

function parseFeedOffset(url: URL, limit: number): number {
  const offset = Math.max(
    0,
    Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0
  );
  const maxOffset = Math.max(0, FEED_MAX_BILLS - limit);
  return Math.min(offset, maxOffset);
}

async function handleStatsJson<T>(
  json: (body: unknown, init?: ResponseInit) => Response,
  load: () => Promise<T>,
  errorMessage: string
): Promise<Response> {
  try {
    return json(await load(), {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : errorMessage;
    return json({ error: "stats_error", message }, { status: 500 });
  }
}

async function handlePipelineRoute<T extends object>(
  request: Request,
  env: Env,
  json: (body: unknown, init?: ResponseInit) => Response,
  run: () => Promise<T>
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, { status: 405 });
  }
  if (!authorizePipeline(request, env)) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await run();
    return json({ ok: true, ...result });
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
      const limit = parseFeedLimit(url);
      const offset = parseFeedOffset(url, limit);
      const feed = await buildFeedPage(env, { limit, offset });
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
    return handleStatsJson(
      json,
      async (): Promise<SessionStatsResponse> => {
        const stats = await buildSessionStats(env.DB, congress, session);
        return { congress, session, ...stats, as_of: asOf };
      },
      "session stats unavailable"
    );
  }

  if (pathname === "/stats/pulse.json") {
    return handleStatsJson(
      json,
      async (): Promise<PulseStatsResponse> => {
        const pulse = await buildPulseStats(env.DB, congress, session);
        return { congress, session, ...pulse, as_of: asOf };
      },
      "pulse stats unavailable"
    );
  }

  if (pathname === "/stats/defectors.json") {
    const chamber = parseChamber(url.searchParams.get("chamber"));
    if (!chamber) {
      return json({ error: "bad_request", message: "chamber must be House or Senate" }, { status: 400 });
    }
    const limit = parseStatsLimit(url);
    return handleStatsJson(
      json,
      async (): Promise<DefectorsResponse> => {
        const defectors = await computeDefectors(env.DB, congress, session, chamber, limit);
        return { chamber, congress, session, defectors, as_of: asOf };
      },
      "defectors unavailable"
    );
  }

  if (pathname === "/stats/portfolios.json") {
    const chamber = parseChamber(url.searchParams.get("chamber"));
    if (!chamber) {
      return json({ error: "bad_request", message: "chamber must be House or Senate" }, { status: 400 });
    }
    const limit = parseStatsLimit(url);
    return handleStatsJson(
      json,
      async (): Promise<PortfoliosResponse> => {
        const movers = await buildPortfolioMovers(env.DB, chamber, limit);
        return { chamber, congress, session, ...movers, as_of: asOf };
      },
      "portfolio stats unavailable"
    );
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

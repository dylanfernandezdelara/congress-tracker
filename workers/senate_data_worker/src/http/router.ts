import { type Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { computeDefectors } from "../analytics/defectors";
import { buildPortfolioMovers } from "../d1/disclosures";
import { getFeedPipelineRun, getLatestPassageVoteDate } from "../d1/pipeline-state";
import { runDisclosuresPipeline } from "../pipeline/run-disclosures";
import { runDigestRefreshPipeline, parseDigestRefreshRequest } from "../pipeline/run-digest-refresh";
import { runFeedPipeline } from "../pipeline/run-feed";
import { runMemberVotesPipeline } from "../pipeline/run-member-votes";
import { runSessionBackfillPipeline } from "../pipeline/run-session-backfill";
import { FEED_DEFAULT_PAGE_SIZE, FEED_MAX_BILLS, FEED_MAX_PAGE_SIZE } from "../constants";
import { buildFeedPage } from "../storage/feed";
import { buildGameReveal, buildGameRounds, parseGameLimit } from "../storage/game";
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
  cacheNoStore,
} from "./responses";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  if (typeof crypto.subtle?.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(aBytes, bBytes);
  }
  let mismatch = 0;
  for (let i = 0; i < aBytes.byteLength; i += 1) {
    mismatch |= aBytes[i]! ^ bBytes[i]!;
  }
  return mismatch === 0;
}

function authorizePipeline(request: Request, env: Env): boolean {
  const token = env.PIPELINE_ADMIN_TOKEN?.trim();
  if (token) {
    const auth = request.headers.get("Authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!bearer) return false;
    return timingSafeEqual(bearer, token);
  }
  // No admin token configured: only allow write pipelines when explicitly opted
  // in for local dev (DEV_OPEN_PIPELINE=1). Never infer dev mode from CORS origin.
  return env.DEV_OPEN_PIPELINE?.trim() === "1";
}

async function healthResponse(
  env: Env,
  json: (body: unknown, init?: ResponseInit) => Response
): Promise<Response> {
  const [latestPassageVoteDate, lastFeedIngest] = await Promise.all([
    getLatestPassageVoteDate(env.DB),
    getFeedPipelineRun(env.DB),
  ]);

  return json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      congress: env.CONGRESS,
      session: env.SESSION,
      data: {
        latest_passage_vote_date: latestPassageVoteDate,
        last_feed_ingest: lastFeedIngest,
        daily_cron_utc: "0 10 * * *",
        admin_feed_ingest: "POST /__pipeline/run/feed (Authorization: Bearer <PIPELINE_ADMIN_TOKEN>)",
      },
    },
    { status: 200, headers: { "Cache-Control": cacheHealth } }
  );
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
  } catch {
    return json({ error: "stats_error", message: errorMessage }, { status: 500 });
  }
}

async function handlePipelineRoute<T extends object>(
  request: Request,
  env: Env,
  json: (body: unknown, init?: ResponseInit) => Response,
  run: () => Promise<T>
): Promise<Response> {
  const adminHeaders = { "Cache-Control": cacheNoStore };
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: adminHeaders });
  }
  if (!authorizePipeline(request, env)) {
    return json({ error: "unauthorized" }, { status: 401, headers: adminHeaders });
  }
  try {
    const result = await run();
    return json({ ok: true, ...result }, { headers: adminHeaders });
  } catch {
    return json({ ok: false, error: "pipeline_failed" }, { status: 500, headers: adminHeaders });
  }
}

/**
 * Public read API: /health, /feed/latest.json, /stats/*.
 * Admin: POST /__pipeline/run/*
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
    return handlePipelineRoute(request, env, json, () =>
      runFeedPipeline(env, { trigger: "admin" })
    );
  }

  if (pathname === "/__pipeline/run/digest-refresh") {
    return handlePipelineRoute(request, env, json, async () => {
      const bills = parseDigestRefreshRequest(url, env);
      return runDigestRefreshPipeline(env, bills);
    });
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
    } catch {
      return json({ error: "feed_error", message: "feed unavailable" }, { status: 500 });
    }
  }

  if (pathname === "/game/rounds.json") {
    try {
      const limit = parseGameLimit(url.searchParams.get("limit"));
      const rounds = await buildGameRounds(env.DB, { limit });
      return json(rounds, {
        status: 200,
        headers: { "Cache-Control": cacheLatest },
      });
    } catch {
      return json({ error: "game_error", message: "game rounds unavailable" }, { status: 500 });
    }
  }

  if (pathname === "/game/reveal.json") {
    const roundId = url.searchParams.get("id")?.trim();
    if (!roundId) {
      return json({ error: "bad_request", message: "id is required" }, { status: 400 });
    }
    try {
      const reveal = await buildGameReveal(env.DB, roundId);
      if (!reveal) {
        return json({ error: "not_found", message: "Round not found" }, { status: 404 });
      }
      return json(reveal, {
        status: 200,
        headers: { "Cache-Control": cacheLatest },
      });
    } catch {
      return json({ error: "game_error", message: "game reveal unavailable" }, { status: 500 });
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

const API_PATH_PREFIXES = ["/health", "/feed/", "/game/", "/stats/", "/__pipeline/"];

function isApiPath(pathname: string): boolean {
  return API_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/** HTTP entry for the unified worker. */
export async function handleFetch(request: Request, env: Env): Promise<Response> {
  return handlePublicFetch(request, env);
}

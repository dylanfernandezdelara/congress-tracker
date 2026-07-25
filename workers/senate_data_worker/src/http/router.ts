import { type Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { computeDefectors, computeRollDefectors } from "../analytics/defectors";
import { buildMemberProfile } from "../analytics/member-profile";
import { buildPortfolioMovers } from "../d1/disclosures";
import {
  getExecutivePostsPipelineFailure,
  getExecutivePostsPipelineSuccess,
  getFeedPipelineFailure,
  getFeedPipelineScheduledSuccess,
  getFeedPipelineSkipped,
  getFeedPipelineSuccess,
  getLatestPassageVoteDate,
  getMissingDigestCount,
} from "../d1/pipeline-state";
import { runDisclosuresPipeline } from "../pipeline/run-disclosures";
import { runExecutivePostsPipeline } from "../pipeline/run-executive-posts";
import { runDigestRefreshPipeline, parseDigestRefreshRequest } from "../pipeline/run-digest-refresh";
import { runFeedWithMemberVotes } from "../pipeline/run-feed-with-member-votes";
import { runMemberVotesPipeline } from "../pipeline/run-member-votes";
import { runMembersRosterPipeline } from "../pipeline/run-members-roster";
import { runSessionBackfillPipeline } from "../pipeline/run-session-backfill";
import {
  FEED_DEFAULT_PAGE_SIZE,
  FEED_MAX_BILLS,
  FEED_MAX_PAGE_SIZE,
  FEED_PIPELINE_CRON_UTC,
  FEED_PIPELINE_STALE_HOURS,
  EXECUTIVE_PIPELINE_STALE_HOURS,
  EXECUTIVE_POSTS_CRON_UTC,
} from "../constants";
import { normalizeFeedSearchQuery } from "../d1/feed-search";
import { buildIngestMonitorPayload } from "./ingest-health";
import { buildFeedPage } from "../storage/feed";
import { buildExecutiveAlerts } from "../storage/executive";
import { buildPulseStats } from "../storage/pulse-stats";
import { buildNotableVotes } from "../analytics/notable-votes";
import { buildSessionStats } from "../storage/session-stats";
import type {
  Chamber,
  DefectorsResponse,
  MemberProfileResponse,
  NotableVotesResponse,
  PortfoliosResponse,
  PulseStatsResponse,
  SessionStatsResponse,
  VoteDefectorsResponse,
} from "../types";
import { isPipelineBusyError, withPipelineLease } from "../d1/pipeline-lease";
import { authorizePipeline, isPreviewWorkerHost } from "./pipeline-auth";
import {
  buildCorsHeaders,
  buildJsonResponse,
  cacheHealth,
  cacheLatest,
  cacheNoStore,
} from "./responses";

type JsonFn = (body: unknown, init?: ResponseInit) => Response;

type RouteContext = {
  request: Request;
  env: Env;
  url: URL;
  json: JsonFn;
  ctx?: Pick<ExecutionContext, "waitUntil">;
};

async function loadIngestMonitor(env: Env) {
  const [
    latestPassageVoteDate,
    missingDigestCount,
    lastSuccess,
    lastScheduledSuccess,
    lastFailure,
    lastSkipped,
    executiveLastSuccess,
    executiveLastFailure,
  ] = await Promise.all([
    getLatestPassageVoteDate(env),
    getMissingDigestCount(env),
    getFeedPipelineSuccess(env.DB),
    getFeedPipelineScheduledSuccess(env.DB),
    getFeedPipelineFailure(env.DB),
    getFeedPipelineSkipped(env.DB),
    getExecutivePostsPipelineSuccess(env.DB),
    getExecutivePostsPipelineFailure(env.DB),
  ]);

  return buildIngestMonitorPayload({
    now: new Date(),
    staleAfterHours: FEED_PIPELINE_STALE_HOURS,
    dailyCronUtc: FEED_PIPELINE_CRON_UTC,
    latestPassageVoteDate,
    missingDigestCount,
    lastSuccess,
    lastScheduledSuccess,
    lastFailure,
    lastSkipped,
    executive: {
      staleAfterHours: EXECUTIVE_PIPELINE_STALE_HOURS,
      hourlyCronUtc: EXECUTIVE_POSTS_CRON_UTC,
      lastSuccess: executiveLastSuccess,
      lastFailure: executiveLastFailure,
    },
  });
}

async function healthResponse(env: Env, json: JsonFn): Promise<Response> {
  let ingest: Awaited<ReturnType<typeof loadIngestMonitor>> | undefined;
  let dataError: string | undefined;

  try {
    ingest = await loadIngestMonitor(env);
  } catch (err: unknown) {
    console.error("health_route_error", err);
    dataError = "data_unavailable";
  }

  return json(
    {
      status:
        ingest &&
        (ingest.status === "failed" ||
          ingest.status === "stale" ||
          ingest.status === "unknown")
          ? "degraded"
          : "ok",
      timestamp: new Date().toISOString(),
      congress: env.CONGRESS,
      session: env.SESSION,
      data: {
        ingest,
        ...(dataError ? { error: dataError } : {}),
      },
    },
    { status: 200, headers: { "Cache-Control": cacheHealth } }
  );
}

async function ingestMonitorResponse(env: Env, json: JsonFn): Promise<Response> {
  try {
    const ingest = await loadIngestMonitor(env);
    return json(
      {
        as_of: new Date().toISOString(),
        ingest,
        alerting: {
          cloudflare_logs: "Filter Workers Observability for event feed_pipeline_failed or origin scheduled.",
          external_monitor:
            "Poll GET /health or /debug/ingest.json and alert when data.ingest.status is not ok.",
        },
      },
      { status: 200, headers: { "Cache-Control": cacheNoStore } }
    );
  } catch {
    return json(
      { error: "ingest_monitor_unavailable", message: "Could not load ingest monitor data." },
      { status: 500, headers: { "Cache-Control": cacheNoStore } }
    );
  }
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

function parseFeedSearchQuery(url: URL): string | undefined {
  return normalizeFeedSearchQuery(url.searchParams.get("q"));
}

function parseRollNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function handleStatsJson<T>(
  json: JsonFn,
  load: () => Promise<T>,
  errorMessage: string
): Promise<Response> {
  try {
    return json(await load(), {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  } catch (err: unknown) {
    console.error("stats_route_error", err);
    return json({ error: "stats_error", message: errorMessage }, { status: 500 });
  }
}

async function handlePipelineRoute<T extends object>(
  request: Request,
  env: Env,
  json: JsonFn,
  run: () => Promise<T>
): Promise<Response> {
  const adminHeaders = { "Cache-Control": cacheNoStore };
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: adminHeaders });
  }
  if (!authorizePipeline(request, env)) {
    const hostname = new URL(request.url).hostname;
    const error =
      isPreviewWorkerHost(hostname) && env.DEV_OPEN_PIPELINE?.trim() !== "1"
        ? "preview_pipeline_writes_disabled"
        : "unauthorized";
    return json({ error }, { status: 401, headers: adminHeaders });
  }
  try {
    const result = await withPipelineLease(env.DB, run);
    return json({ ok: true, ...result }, { headers: adminHeaders });
  } catch (err: unknown) {
    if (isPipelineBusyError(err)) {
      return json(
        { ok: false, error: "pipeline_busy", message: "Another pipeline run is in progress" },
        { status: 409, headers: adminHeaders }
      );
    }
    console.error("pipeline_route_error", err);
    return json({ ok: false, error: "pipeline_failed" }, { status: 500, headers: adminHeaders });
  }
}

const PIPELINE_ROUTES: Record<string, (ctx: RouteContext) => Promise<object>> = {
  "/__pipeline/run/feed": ({ env }) => runFeedWithMemberVotes(env, { trigger: "admin" }),
  "/__pipeline/run/digest-refresh": ({ env, url }) => {
    const bills = parseDigestRefreshRequest(url, env);
    return runDigestRefreshPipeline(env, bills);
  },
  "/__pipeline/run/session-backfill": ({ env }) => runSessionBackfillPipeline(env),
  "/__pipeline/run/member-votes": ({ env }) => runMemberVotesPipeline(env),
  "/__pipeline/run/members-roster": ({ env }) => runMembersRosterPipeline(env),
  "/__pipeline/run/disclosures": ({ env }) => runDisclosuresPipeline(env),
  "/__pipeline/run/executive-posts": ({ env }) =>
    runExecutivePostsPipeline(env, { trigger: "admin" }),
};

const GET_ROUTES: Record<string, (ctx: RouteContext) => Promise<Response>> = {
  "/health": ({ env, json }) => healthResponse(env, json),
  "/debug/ingest.json": ({ env, json }) => ingestMonitorResponse(env, json),
  "/feed/latest.json": async ({ env, url, json }) => {
    const chamberParam = url.searchParams.get("chamber");
    let chamber: Chamber | undefined;
    if (chamberParam !== null && chamberParam !== "") {
      const parsed = parseChamber(chamberParam);
      if (!parsed) {
        return json(
          { error: "bad_request", message: "chamber must be House or Senate" },
          { status: 400 }
        );
      }
      chamber = parsed;
    }
    try {
      const limit = parseFeedLimit(url);
      const offset = parseFeedOffset(url, limit);
      const q = parseFeedSearchQuery(url);
      const feed = await buildFeedPage(env, { limit, offset, chamber, q });
      return json(feed, {
        status: 200,
        headers: { "Cache-Control": cacheLatest },
      });
    } catch (err: unknown) {
      console.error("feed_route_error", err);
      return json({ error: "feed_error", message: "feed unavailable" }, { status: 500 });
    }
  },
  "/executive/alerts.json": async ({ env, json }) => {
    try {
      const alerts = await buildExecutiveAlerts(env);
      return json(alerts, {
        status: 200,
        headers: { "Cache-Control": cacheLatest },
      });
    } catch {
      return json({ error: "executive_error", message: "executive alerts unavailable" }, { status: 500 });
    }
  },
  "/feed/vote-defectors.json": async ({ env, url, json }) => {
    const chamber = parseChamber(url.searchParams.get("chamber"));
    const rollCongress = Number.parseInt(url.searchParams.get("congress") ?? "", 10);
    const rollSession = Number.parseInt(url.searchParams.get("session") ?? "", 10);
    const rollNumber = parseRollNumber(url.searchParams.get("roll_number"));
    if (!chamber || !Number.isFinite(rollCongress) || !Number.isFinite(rollSession) || rollNumber === null) {
      return json(
        {
          error: "bad_request",
          message: "chamber, congress, session, and roll_number are required",
        },
        { status: 400 }
      );
    }
    try {
      const { defectors, party_splits, member_votes_available } = await computeRollDefectors(
        env.DB,
        {
          chamber,
          congress: rollCongress,
          session: rollSession,
          roll_number: rollNumber,
        }
      );
      const body: VoteDefectorsResponse = {
        chamber,
        congress: rollCongress,
        session: rollSession,
        roll_number: rollNumber,
        defectors,
        party_splits,
        member_votes_available,
        as_of: new Date().toISOString(),
      };
      return json(body, {
        status: 200,
        headers: { "Cache-Control": cacheLatest },
      });
    } catch {
      return json({ error: "feed_error", message: "vote defectors unavailable" }, { status: 500 });
    }
  },
  "/stats/session.json": ({ env, json }) => {
    const congress = congressNumber(env);
    const session = sessionNumber(env);
    const asOf = new Date().toISOString();
    return handleStatsJson(
      json,
      async (): Promise<SessionStatsResponse> => {
        const stats = await buildSessionStats(env.DB, congress, session);
        return { congress, session, ...stats, as_of: asOf };
      },
      "session stats unavailable"
    );
  },
  "/stats/pulse.json": ({ env, json }) => {
    const congress = congressNumber(env);
    const session = sessionNumber(env);
    const asOf = new Date().toISOString();
    return handleStatsJson(
      json,
      async (): Promise<PulseStatsResponse> => {
        const pulse = await buildPulseStats(env.DB, congress, session);
        return { congress, session, ...pulse, as_of: asOf };
      },
      "pulse stats unavailable"
    );
  },
  "/stats/notable.json": ({ env, url, json, ctx }) => {
    const congress = congressNumber(env);
    const session = sessionNumber(env);
    const asOf = new Date().toISOString();
    const limit = parseStatsLimit(url);
    return handleStatsJson(
      json,
      async (): Promise<NotableVotesResponse> => {
        const { notable, detection_method } = await buildNotableVotes(
          env.DB,
          congress,
          session,
          Math.min(limit, 3),
          {
            env,
            waitUntil: ctx?.waitUntil.bind(ctx),
          }
        );
        return {
          congress,
          session,
          notable,
          detection_method,
          as_of: asOf,
        };
      },
      "notable votes unavailable"
    );
  },
  "/stats/defectors.json": ({ env, url, json }) => {
    const congress = congressNumber(env);
    const session = sessionNumber(env);
    const asOf = new Date().toISOString();
    const chamber = parseChamber(url.searchParams.get("chamber"));
    if (!chamber) {
      return Promise.resolve(
        json({ error: "bad_request", message: "chamber must be House or Senate" }, { status: 400 })
      );
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
  },
  "/stats/member.json": async ({ env, url, json }) => {
    const congress = congressNumber(env);
    const session = sessionNumber(env);
    const bioguideId = url.searchParams.get("bioguide_id")?.trim() ?? "";
    if (!bioguideId) {
      return json(
        { error: "bad_request", message: "bioguide_id is required" },
        { status: 400 }
      );
    }
    try {
      const profile = await buildMemberProfile(env.DB, congress, session, bioguideId);
      if (!profile) {
        return json(
          { error: "not_found", message: "member not found" },
          { status: 404, headers: { "Cache-Control": cacheNoStore } }
        );
      }
      return json(profile satisfies MemberProfileResponse, {
        status: 200,
        headers: { "Cache-Control": cacheLatest },
      });
    } catch (err: unknown) {
      console.error("member_route_error", err);
      return json(
        { error: "stats_error", message: "member profile unavailable" },
        { status: 500, headers: { "Cache-Control": cacheNoStore } }
      );
    }
  },
  "/stats/portfolios.json": ({ env, url, json }) => {
    const congress = congressNumber(env);
    const session = sessionNumber(env);
    const asOf = new Date().toISOString();
    const chamber = parseChamber(url.searchParams.get("chamber"));
    if (!chamber) {
      return Promise.resolve(
        json({ error: "bad_request", message: "chamber must be House or Senate" }, { status: 400 })
      );
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
  },
};

/**
 * Public read API: /health, /feed/latest.json, /stats/*.
 * Admin: POST /__pipeline/run/*
 */
export async function handlePublicFetch(
  request: Request,
  env: Env,
  ctx?: Pick<ExecutionContext, "waitUntil">
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const corsHeaders = buildCorsHeaders(env);
  const json: JsonFn = (body, init) => buildJsonResponse(body, corsHeaders, init);
  const notFound = (path: string) =>
    json({ error: "not_found", message: "Resource not found", path }, { status: 404 });
  const routeCtx: RouteContext = { request, env, url, json, ctx };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const pipeline = PIPELINE_ROUTES[pathname];
  if (pipeline) {
    return handlePipelineRoute(request, env, json, () => pipeline(routeCtx));
  }

  if (request.method !== "GET") {
    return json({ error: "method_not_allowed", message: "Only GET requests are allowed" }, { status: 405 });
  }

  const getRoute = GET_ROUTES[pathname];
  if (getRoute) {
    return getRoute(routeCtx);
  }

  if (env.ASSETS && !isApiPath(pathname)) {
    return env.ASSETS.fetch(request);
  }

  return notFound(pathname);
}

const API_PATH_PREFIXES = ["/health", "/debug/", "/feed/", "/stats/", "/executive/", "/__pipeline/"];

function isApiPath(pathname: string): boolean {
  return API_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/** HTTP entry for the unified worker. */
export async function handleFetch(
  request: Request,
  env: Env,
  ctx?: ExecutionContext
): Promise<Response> {
  return handlePublicFetch(request, env, ctx);
}

import type { BriefingFeedResponse, VoteDetailResponse } from "./platform-types";
import { readLatestBriefingFromD1, readVoteDetailFromD1 } from "./d1/materialization";

export type { ApiEnv } from "./worker-env";
import type { ApiEnv } from "./worker-env";

const cacheHealth = "s-maxage=60, max-age=0, must-revalidate";
const cacheLatest = "s-maxage=300, stale-while-revalidate=86400";

function buildCorsHeaders(env: ApiEnv): HeadersInit {
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim();
  const restrictedOrigin = allowedOrigin && allowedOrigin !== "*" ? allowedOrigin : null;
  const headers: HeadersInit = {
    "Access-Control-Allow-Origin": restrictedOrigin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (restrictedOrigin) headers["Vary"] = "Origin";
  return headers;
}

function buildJsonResponse(body: unknown, corsHeaders: HeadersInit, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function buildNotFoundResponse(path: string, corsHeaders: HeadersInit): Response {
  return buildJsonResponse(
    { error: "not_found", message: "Resource not found", path },
    corsHeaders,
    { status: 404 }
  );
}

function parseIntSafe(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export async function handleApiFetch(request: Request, env: ApiEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  const corsHeaders = buildCorsHeaders(env);
  const jsonResponse = (body: unknown, init?: ResponseInit) => buildJsonResponse(body, corsHeaders, init);
  const notFoundResponse = (path: string) => buildNotFoundResponse(path, corsHeaders);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return jsonResponse(
      { error: "method_not_allowed", message: "Only GET requests are allowed" },
      { status: 405 }
    );
  }

  if (pathname === "/health") {
    return jsonResponse(
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

  if (pathname === "/health/data") {
    const maxFreshHours = Math.max(1, parseIntSafe(env.DATA_FRESHNESS_MAX_HOURS, 36));
    const row = await env.SENATE_DB.prepare(
      "SELECT generated_at FROM daily_briefings WHERE briefing_key = ? LIMIT 1"
    )
      .bind("latest")
      .all<{ generated_at: string }>();
    const generatedAt = row.results?.[0]?.generated_at;
    if (!generatedAt) {
      return jsonResponse(
        {
          status: "stale",
          message: "No materialized briefing found in D1.",
          max_fresh_hours: maxFreshHours,
        },
        { status: 503, headers: { "Cache-Control": cacheHealth } }
      );
    }

    const generatedAtMs = new Date(generatedAt).getTime();
    const ageHours = Number(((Date.now() - generatedAtMs) / 3_600_000).toFixed(2));
    const fresh = Number.isFinite(generatedAtMs) && ageHours <= maxFreshHours;
    return jsonResponse(
      {
        status: fresh ? "ok" : "stale",
        generated_at: generatedAt,
        age_hours: ageHours,
        max_fresh_hours: maxFreshHours,
      },
      {
        status: fresh ? 200 : 503,
        headers: { "Cache-Control": cacheHealth },
      }
    );
  }

  if (pathname === "/briefings/latest.json") {
    const payload = await readLatestBriefingFromD1(env.SENATE_DB);
    if (!payload) return notFoundResponse(pathname);
    return jsonResponse(payload, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  const voteDetailMatch = pathname.match(/^\/votes\/(\d+)\/(\d+)\/(\d+)\.json$/);
  if (voteDetailMatch) {
    const congress = Number(voteDetailMatch[1]);
    const session = Number(voteDetailMatch[2]);
    const voteNumber = Number(voteDetailMatch[3]);

    const payload = await readVoteDetailFromD1(env.SENATE_DB, congress, session, voteNumber);
    if (!payload) return notFoundResponse(pathname);
    return jsonResponse(payload, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  return notFoundResponse(pathname);
}

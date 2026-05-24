import type {
  ActivityIndexJson,
  MemberActivityJson,
  MemberIndexJson,
  MetaJson,
  SessionOverview,
  SnapshotJson,
  VoteLedger,
} from "./types";
import type { BriefingFeedResponse, VoteDetailResponse } from "./platform-types";
import { readLatestBriefingFromD1, readVoteDetailFromD1 } from "./d1/materialization";
import { buildBriefingFeedResponse, buildVoteDetailResponse } from "./read-model";
import {
  buildActivitiesIndexKey,
  buildCoverageSnapshotKey,
  buildLatestBriefingKey,
  buildLatestKey,
  buildMemberKeys,
  buildMemberLatestKey,
  buildMembersIndexKey,
  buildMetaKey,
  buildSnapshotKey,
  buildSessionOverviewKey,
  buildVoteDetailKey,
  buildVoteLedgerKey,
  readJsonFromR2,
} from "./storage";

export type { ApiEnv } from "./worker-env";
import type { ApiEnv } from "./worker-env";

const cacheHealth = "s-maxage=60, max-age=0, must-revalidate";
const cacheLatest = "s-maxage=300, stale-while-revalidate=86400";
const cacheSnapshot = "s-maxage=86400, stale-while-revalidate=604800";

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

async function readDerivedBriefing(env: ApiEnv) {
  const [ledger, overview, activities] = await Promise.all([
    readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey()),
    readJsonFromR2<SessionOverview>(env.DATA_BUCKET, buildSessionOverviewKey()),
    readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey()),
  ]);
  if (!ledger || !overview) return null;
  return buildBriefingFeedResponse(ledger, overview, activities, "derived");
}

async function readDerivedVoteDetail(env: ApiEnv, voteNumber: number) {
  const [ledger, overview, activities] = await Promise.all([
    readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey()),
    readJsonFromR2<SessionOverview>(env.DATA_BUCKET, buildSessionOverviewKey()),
    readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey()),
  ]);
  if (!ledger || !overview) return null;
  return buildVoteDetailResponse(ledger, overview, activities, voteNumber, "derived");
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
    const activityIndex = await readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey());
    if (!activityIndex?.generated_at) {
      return jsonResponse(
        { status: "stale", message: "No activities index found in storage.", max_fresh_hours: maxFreshHours },
        { status: 503, headers: { "Cache-Control": cacheHealth } }
      );
    }

    const generatedAt = new Date(activityIndex.generated_at).getTime();
    const ageHours = Number(((Date.now() - generatedAt) / 3_600_000).toFixed(2));
    const fresh = Number.isFinite(generatedAt) && ageHours <= maxFreshHours;
    return jsonResponse(
      {
        status: fresh ? "ok" : "stale",
        generated_at: activityIndex.generated_at,
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
    const dbValue = env.SENATE_DB ? await readLatestBriefingFromD1(env.SENATE_DB) : null;
    const r2Value = dbValue
      ? null
      : await readJsonFromR2<BriefingFeedResponse>(env.DATA_BUCKET, buildLatestBriefingKey());
    const derived = !dbValue && !r2Value ? await readDerivedBriefing(env) : null;
    const payload = dbValue ?? r2Value ?? derived;
    if (!payload) return notFoundResponse(pathname);
    return jsonResponse(payload, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  const voteDetailMatch = pathname.match(/^\/votes\/(\d+)\/(\d+)\/(\d+)\.json$/);
  if (voteDetailMatch) {
    const congress = Number(voteDetailMatch[1]);
    const session = Number(voteDetailMatch[2]);
    const voteNumber = Number(voteDetailMatch[3]);

    const dbValue = env.SENATE_DB
      ? await readVoteDetailFromD1(env.SENATE_DB, congress, session, voteNumber)
      : null;
    const r2Value = dbValue
      ? null
      : await readJsonFromR2<VoteDetailResponse>(
          env.DATA_BUCKET,
          buildVoteDetailKey(congress, session, voteNumber)
        );
    const derived = !dbValue && !r2Value ? await readDerivedVoteDetail(env, voteNumber) : null;
    const payload = dbValue ?? r2Value ?? derived;
    if (!payload) return notFoundResponse(pathname);
    return jsonResponse(payload, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  const latestMatch = pathname.match(/^\/state\/([A-Z]{2})\/latest\.json$/);
  if (latestMatch) {
    const data = await readJsonFromR2<SnapshotJson>(env.DATA_BUCKET, buildLatestKey(latestMatch[1]));
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  if (pathname === "/members/index.json") {
    const data = await readJsonFromR2<MemberIndexJson>(env.DATA_BUCKET, buildMembersIndexKey());
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  if (pathname === "/activities/index.json") {
    const data = await readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey());
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  if (pathname === "/votes/ledger.json") {
    const data = await readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey());
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  if (pathname === "/stats/overview.json") {
    const data = await readJsonFromR2<SessionOverview>(env.DATA_BUCKET, buildSessionOverviewKey());
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  const memberLatestMatch = pathname.match(/^\/member\/([A-Z]\d{6})\/latest\.json$/);
  if (memberLatestMatch) {
    const data = await readJsonFromR2<MemberActivityJson>(env.DATA_BUCKET, buildMemberLatestKey(memberLatestMatch[1]));
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  const memberSnapshotMatch = pathname.match(/^\/member\/([A-Z]\d{6})\/(\d{4}-\d{2}-\d{2})\.json$/);
  if (memberSnapshotMatch) {
    const data = await readJsonFromR2<MemberActivityJson>(
      env.DATA_BUCKET,
      buildMemberKeys(memberSnapshotMatch[1], memberSnapshotMatch[2]).snapshot
    );
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheSnapshot } });
  }

  const metaMatch = pathname.match(/^\/state\/([A-Z]{2})\/_meta\.json$/);
  if (metaMatch) {
    const data = await readJsonFromR2<MetaJson>(env.DATA_BUCKET, buildMetaKey(metaMatch[1]));
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  const snapshotMatch = pathname.match(/^\/state\/([A-Z]{2})\/(\d{4}-\d{2}-\d{2})\.json$/);
  if (snapshotMatch) {
    const data = await readJsonFromR2<SnapshotJson>(
      env.DATA_BUCKET,
      buildSnapshotKey(snapshotMatch[1], snapshotMatch[2])
    );
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheSnapshot } });
  }

  const coverageMatch = pathname.match(/^\/stats\/coverage\/(\d{4}-\d{2}-\d{2})\.json$/);
  if (coverageMatch) {
    const data = await readJsonFromR2(env.DATA_BUCKET, buildCoverageSnapshotKey(coverageMatch[1]));
    if (!data) return notFoundResponse(pathname);
    return jsonResponse(data, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  return notFoundResponse(pathname);
}

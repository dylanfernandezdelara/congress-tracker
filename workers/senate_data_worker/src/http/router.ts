import type { ActivityIndexJson, SessionOverview, VoteLedger } from "../types";
import { readDocumentJson } from "../storage/documents";
import { readLatestBriefingFromD1, readVoteDetailFromD1 } from "../d1/materialization";
import {
  buildActivitiesIndexKey,
  buildSessionOverviewKey,
  buildVoteLedgerKey,
  readLatestBriefingGeneratedAt,
} from "../storage";
import { parseIntSafe, type Env } from "../config";
import { buildRuntime } from "../runtime";
import { authorizePipelineAdmin } from "../pipeline-auth";
import { readPipelineStatus } from "../storage";
import { materializeReadModels } from "../pipeline/materialize";
import { processPipelineJob } from "../pipeline/jobs";
import { runScheduledIngestion } from "../pipeline/scheduled-ingestion";
import {
  buildCorsHeaders,
  buildJsonResponse,
  cacheHealth,
  cacheLatest,
} from "./responses";

function isPipelineAdminPath(pathname: string): boolean {
  return pathname === "/__pipeline/status" || pathname.startsWith("/__pipeline/run/");
}

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

async function healthDataResponse(
  env: Env,
  json: (body: unknown, init?: ResponseInit) => Response
): Promise<Response> {
  const maxFreshHours = Math.max(1, parseIntSafe(env.DATA_FRESHNESS_MAX_HOURS, 36));
  const generatedAt = await readLatestBriefingGeneratedAt(env.SENATE_DB);
  if (!generatedAt) {
    return json(
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
  return json(
    {
      status: fresh ? "ok" : "stale",
      generated_at: generatedAt,
      age_hours: ageHours,
      max_fresh_hours: maxFreshHours,
    },
    { status: fresh ? 200 : 503, headers: { "Cache-Control": cacheHealth } }
  );
}

/**
 * Serves the public read API only: /health, /health/data, /briefings/latest.json,
 * and /votes/:c/:s/:n.json. Used directly by the read-only remote-inspection entry
 * and shared by the full router below.
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
    return healthDataResponse(env, json);
  }

  if (pathname === "/briefings/latest.json") {
    const payload = await readLatestBriefingFromD1(env.SENATE_DB);
    if (!payload) return notFound(pathname);
    return json(payload, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  const voteDetailMatch = pathname.match(/^\/votes\/(\d+)\/(\d+)\/(\d+)\.json$/);
  if (voteDetailMatch) {
    const congress = Number(voteDetailMatch[1]);
    const session = Number(voteDetailMatch[2]);
    const voteNumber = Number(voteDetailMatch[3]);
    const payload = await readVoteDetailFromD1(env.SENATE_DB, congress, session, voteNumber);
    if (!payload) return notFound(pathname);
    return json(payload, { status: 200, headers: { "Cache-Control": cacheLatest } });
  }

  return notFound(pathname);
}

/**
 * Single HTTP entry for the unified worker. Public read routes plus the
 * token-gated /__pipeline/* admin routes (status, ingestion, materialize,
 * historical-backfill).
 */
export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const corsHeaders = buildCorsHeaders(env);
  const json = (body: unknown, init?: ResponseInit) => buildJsonResponse(body, corsHeaders, init);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const adminPath = isPipelineAdminPath(pathname);

  if (adminPath) {
    if (request.method !== "GET" && request.method !== "POST") {
      return json(
        { error: "method_not_allowed", message: "Pipeline admin routes allow GET or POST only" },
        { status: 405 }
      );
    }
    const unauthorized = await authorizePipelineAdmin(request, env, json);
    if (unauthorized) return unauthorized;
  }

  // One runtime per admin run, mirroring worker.ts scheduled/queue handlers.
  const adminRuntime = adminPath ? buildRuntime(env) : null;

  if (pathname === "/__pipeline/status") {
    const pipelineStatus = await readPipelineStatus(env.SENATE_DB);
    return json(
      { status: "ok", queue_enabled: Boolean(env.PIPELINE_QUEUE), d1_enabled: true, ...pipelineStatus },
      { status: 200, headers: { "Cache-Control": cacheHealth } }
    );
  }

  if (pathname === "/__pipeline/run/materialize") {
    const [ledger, overview, activityIndex] = await Promise.all([
      readDocumentJson<VoteLedger>(env.SENATE_DB, buildVoteLedgerKey()),
      readDocumentJson<SessionOverview>(env.SENATE_DB, buildSessionOverviewKey()),
      readDocumentJson<ActivityIndexJson>(env.SENATE_DB, buildActivitiesIndexKey()),
    ]);
    if (!ledger || !overview) {
      return json(
        { error: "missing_prerequisites", message: "Ledger or overview data is missing from storage." },
        { status: 503 }
      );
    }
    await materializeReadModels(env, ledger, overview, activityIndex);
    return json({ status: "ok", action: "materialize", vote_count: ledger.entries.length }, { status: 200 });
  }

  if (pathname === "/__pipeline/run/ingestion") {
    await runScheduledIngestion(env, adminRuntime ?? buildRuntime(env));
    return json({ status: "ok", action: "scheduled_ingestion" }, { status: 200 });
  }

  if (pathname === "/__pipeline/run/historical-backfill") {
    const params = new URL(request.url).searchParams;
    const congress = Number(params.get("congress") ?? env.CONGRESS);
    const sessionParam = params.get("session");
    const session = sessionParam ? Number(sessionParam) : undefined;
    if (
      !Number.isInteger(congress) ||
      congress <= 0 ||
      (session !== undefined && (!Number.isInteger(session) || session < 1 || session > 2))
    ) {
      return json(
        { error: "invalid_backfill_target", message: "Provide a valid congress and optional session=1|2." },
        { status: 400 }
      );
    }
    await processPipelineJob(
      { type: "historical_backfill", created_at: new Date().toISOString(), congress, session },
      env,
      adminRuntime ?? buildRuntime(env)
    );
    return json(
      { status: "ok", action: "historical_backfill", congress, session: session ?? null, inline: !env.PIPELINE_QUEUE },
      { status: 200 }
    );
  }

  // Public read routes (and 404 fallthrough).
  return handlePublicFetch(request, env);
}

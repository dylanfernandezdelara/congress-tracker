import { handleApiFetch } from "./http";
import {
  buildActivitiesIndexKey,
  buildSessionOverviewKey,
  buildVoteLedgerKey,
  readJsonFromR2,
} from "./storage";
import type { PipelineEnv } from "./pipeline-env";
import type { ActivityIndexJson, SessionOverview, VoteLedger } from "./types";
import { authorizePipelineRun, buildCorsHeaders } from "./pipeline-auth";
import { buildJsonResponse, cacheHealth } from "./pipeline-logging";
import { parseIntSafe } from "./pipeline-runtime-config";
import { readPipelineStatus } from "./pipeline-status";
import { materializeReadModels } from "./pipeline-materialize";
import { processPipelineJob } from "./pipeline-jobs";
import { runScheduledIngestion } from "./scheduled-ingestion";

export async function handleFetch(request: Request, env: PipelineEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  const corsHeaders = buildCorsHeaders(env);
  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    buildJsonResponse(body, corsHeaders, init);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only allow GET requests
  if (request.method !== "GET") {
    return jsonResponse(
      {
        error: "method_not_allowed",
        message: "Only GET requests are allowed",
      },
      { status: 405 }
    );
  }

  // Health check (no R2 access)
  if (pathname === "/health") {
    return jsonResponse(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        target_state: env.TARGET_STATE,
        congress: env.CONGRESS,
        session: env.SESSION,
      },
      {
        status: 200,
        headers: { "Cache-Control": cacheHealth },
      }
    );
  }

  if (pathname === "/health/data") {
    const maxFreshHours = Math.max(1, parseIntSafe(env.DATA_FRESHNESS_MAX_HOURS, 36));
    const activityIndex = await readJsonFromR2<ActivityIndexJson>(
      env.DATA_BUCKET,
      buildActivitiesIndexKey()
    );
    if (!activityIndex?.generated_at) {
      return jsonResponse(
        {
          status: "stale",
          message: "No activities index found in storage.",
          max_fresh_hours: maxFreshHours,
        },
        {
          status: 503,
          headers: { "Cache-Control": cacheHealth },
        }
      );
    }
    const generatedAt = new Date(activityIndex.generated_at).getTime();
    const now = Date.now();
    const ageHours = Number(((now - generatedAt) / 3_600_000).toFixed(2));
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

  if (pathname === "/__pipeline/status") {
    if (!env.SENATE_DB) {
      return jsonResponse(
        { status: "ok", queue_enabled: Boolean(env.PIPELINE_QUEUE), d1_enabled: false },
        { status: 200, headers: { "Cache-Control": cacheHealth } }
      );
    }

    const pipelineStatus = await readPipelineStatus(env.SENATE_DB);

    return jsonResponse(
      {
        status: "ok",
        queue_enabled: Boolean(env.PIPELINE_QUEUE),
        d1_enabled: true,
        ...pipelineStatus,
      },
      { status: 200, headers: { "Cache-Control": cacheHealth } }
    );
  }

  if (pathname.startsWith("/__pipeline/run/")) {
    const unauthorized = await authorizePipelineRun(request, env, jsonResponse);
    if (unauthorized) return unauthorized;
  }

  if (pathname === "/__pipeline/run/materialize") {
    const [ledger, overview, activityIndex] = await Promise.all([
      readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey()),
      readJsonFromR2<SessionOverview>(env.DATA_BUCKET, buildSessionOverviewKey()),
      readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey()),
    ]);
    if (!ledger || !overview) {
      return jsonResponse(
        { error: "missing_prerequisites", message: "Ledger or overview data is missing from storage." },
        { status: 503 }
      );
    }
    await materializeReadModels(env, ledger, overview, activityIndex);
    return jsonResponse({ status: "ok", action: "materialize", vote_count: ledger.entries.length }, { status: 200 });
  }

  if (pathname === "/__pipeline/run/ingestion") {
    await runScheduledIngestion(env);
    return jsonResponse({ status: "ok", action: "scheduled_ingestion" }, { status: 200 });
  }

  if (pathname === "/__pipeline/run/evidence") {
    const voteNumber = Number(new URL(request.url).searchParams.get("vote"));
    if (!Number.isInteger(voteNumber) || voteNumber <= 0) {
      return jsonResponse(
        { error: "invalid_vote", message: "Provide a positive integer vote query parameter." },
        { status: 400 }
      );
    }
    await processPipelineJob(
      {
        type: "extract_vote_evidence",
        created_at: new Date().toISOString(),
        congress: Number(env.CONGRESS),
        session: Number(env.SESSION),
        vote_number: voteNumber,
      },
      env
    );
    return jsonResponse({ status: "ok", action: "extract_vote_evidence", vote_number: voteNumber }, { status: 200 });
  }

  if (pathname === "/__pipeline/run/historical-backfill") {
    const params = new URL(request.url).searchParams;
    const congress = Number(params.get("congress") ?? env.CONGRESS);
    const sessionParam = params.get("session");
    const session = sessionParam ? Number(sessionParam) : undefined;
    if (!Number.isInteger(congress) || congress <= 0 || (session !== undefined && (!Number.isInteger(session) || session < 1 || session > 2))) {
      return jsonResponse(
        { error: "invalid_backfill_target", message: "Provide a valid congress and optional session=1|2." },
        { status: 400 }
      );
    }
    await processPipelineJob(
      {
        type: "historical_backfill",
        created_at: new Date().toISOString(),
        congress,
        session,
      },
      env
    );
    return jsonResponse(
      { status: "ok", action: "historical_backfill", congress, session: session ?? null, inline: !env.PIPELINE_QUEUE },
      { status: 200 }
    );
  }

  return handleApiFetch(request, env);
}

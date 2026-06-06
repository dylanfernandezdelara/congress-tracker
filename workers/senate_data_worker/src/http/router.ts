import { parseIntSafe, type Env } from "../config";
import { buildRuntime } from "../runtime";
import { authorizePipelineAdmin } from "../pipeline-auth";
import {
  hasMaterializationPrerequisites,
  materializeReadModels,
  readMaterializationPrerequisites,
} from "../pipeline/materialize";
import { processPipelineJob } from "../pipeline/jobs";
import { runScheduledIngestion } from "../pipeline/scheduled-ingestion";
import {
  buildCorsHeaders,
  buildJsonResponse,
  cacheHealth,
  cacheLatest,
} from "./responses";

const STORAGE_UNAVAILABLE = {
  error: "storage_not_configured",
  message: "D1 storage layer has not been implemented yet.",
} as const;

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
  return json(
    {
      status: "stale",
      message: STORAGE_UNAVAILABLE.message,
      max_fresh_hours: maxFreshHours,
    },
    { status: 503, headers: { "Cache-Control": cacheHealth } }
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
    return json(STORAGE_UNAVAILABLE, { status: 503, headers: { "Cache-Control": cacheLatest } });
  }

  const voteDetailMatch = pathname.match(/^\/votes\/(\d+)\/(\d+)\/(\d+)\.json$/);
  if (voteDetailMatch) {
    return json(STORAGE_UNAVAILABLE, { status: 503, headers: { "Cache-Control": cacheLatest } });
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

  const adminRuntime = adminPath ? buildRuntime(env) : null;

  if (pathname === "/__pipeline/status") {
    return json(
      {
        status: "ok",
        queue_enabled: Boolean(env.PIPELINE_QUEUE),
        d1_enabled: true,
        storage_configured: false,
      },
      { status: 200, headers: { "Cache-Control": cacheHealth } }
    );
  }

  if (pathname === "/__pipeline/run/materialize") {
    const prereqs = await readMaterializationPrerequisites(env.SENATE_DB);
    if (!hasMaterializationPrerequisites(prereqs)) {
      return json(
        { error: "missing_prerequisites", message: STORAGE_UNAVAILABLE.message },
        { status: 503 }
      );
    }
    await materializeReadModels(
      env,
      prereqs.ledger,
      prereqs.overview,
      prereqs.activityIndex
    );
    return json(
      { status: "ok", action: "materialize", vote_count: prereqs.ledger.entries.length },
      { status: 200 }
    );
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

  return handlePublicFetch(request, env);
}

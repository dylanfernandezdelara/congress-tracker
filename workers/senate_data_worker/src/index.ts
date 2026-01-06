/**
 * Senate Data Worker - Cloudflare Worker for Senate vote ingestion.
 *
 * Handles:
 * - Scheduled (cron) ingestion of Senate roll-call vote data
 * - HTTP API for serving precomputed JSON from R2
 */

import { runIngestion } from "./ingest";
import type { IngestConfig, SnapshotJson, MetaJson } from "./types";
import {
  buildLatestKey,
  buildMetaKey,
  buildSnapshotKey,
  publishToR2,
  readJsonFromR2,
} from "./storage";

// ============================================================================
// Environment Types
// ============================================================================

interface Env {
  DATA_BUCKET: R2Bucket;
  CONGRESS: string;
  SESSION: string;
  TARGET_STATE: string;
}

// ============================================================================
// Headers & Helpers
// ============================================================================

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
  ...corsHeaders,
};

// Cache-Control values per SPEC.md
const cacheHealth = "s-maxage=60, max-age=0, must-revalidate";
const cacheLatest = "s-maxage=300, stale-while-revalidate=86400";
const cacheSnapshot = "s-maxage=86400, stale-while-revalidate=604800";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init?.headers ?? {}),
    },
  });

const notFoundResponse = (path: string) =>
  jsonResponse(
    {
      error: "not_found",
      message: "Resource not found",
      path,
    },
    { status: 404 }
  );

// ============================================================================
// R2 Storage
// ============================================================================
// ============================================================================
// HTTP Handler
// ============================================================================

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

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
      },
      {
        status: 200,
        headers: { "Cache-Control": cacheHealth },
      }
    );
  }

  // Match /state/{STATE}/latest.json
  const latestMatch = pathname.match(/^\/state\/([A-Z]{2})\/latest\.json$/);
  if (latestMatch) {
    const state = latestMatch[1];
    const key = buildLatestKey(state);
    const data = await readJsonFromR2<SnapshotJson>(env.DATA_BUCKET, key);

    if (!data) {
      return notFoundResponse(pathname);
    }

    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /state/{STATE}/_meta.json
  const metaMatch = pathname.match(/^\/state\/([A-Z]{2})\/_meta\.json$/);
  if (metaMatch) {
    const state = metaMatch[1];
    const key = buildMetaKey(state);
    const data = await readJsonFromR2<MetaJson>(env.DATA_BUCKET, key);

    if (!data) {
      return notFoundResponse(pathname);
    }

    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /state/{STATE}/{YYYY-MM-DD}.json (dated snapshot)
  const snapshotMatch = pathname.match(
    /^\/state\/([A-Z]{2})\/(\d{4}-\d{2}-\d{2})\.json$/
  );
  if (snapshotMatch) {
    const state = snapshotMatch[1];
    const date = snapshotMatch[2];
    const key = buildSnapshotKey(state, date);
    const data = await readJsonFromR2<SnapshotJson>(env.DATA_BUCKET, key);

    if (!data) {
      return notFoundResponse(pathname);
    }

    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheSnapshot },
    });
  }

  // No route matched
  return notFoundResponse(pathname);
}

// ============================================================================
// Scheduled (Cron) Handler
// ============================================================================

/**
 * Validates environment configuration and throws if invalid.
 * Fails loudly so cron misconfigurations are caught immediately.
 */
function validateEnv(env: Env): IngestConfig {
  const errors: string[] = [];

  // Validate CONGRESS
  if (!env.CONGRESS) {
    errors.push("CONGRESS environment variable is missing");
  }
  const congress = parseInt(env.CONGRESS, 10);
  if (isNaN(congress) || congress <= 0) {
    errors.push(`CONGRESS must be a positive integer, got: "${env.CONGRESS}"`);
  }

  // Validate SESSION
  if (!env.SESSION) {
    errors.push("SESSION environment variable is missing");
  }
  const session = parseInt(env.SESSION, 10);
  if (isNaN(session) || session <= 0 || session > 2) {
    errors.push(`SESSION must be 1 or 2, got: "${env.SESSION}"`);
  }

  // Validate TARGET_STATE
  if (!env.TARGET_STATE) {
    errors.push("TARGET_STATE environment variable is missing");
  }
  const targetState = env.TARGET_STATE?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(targetState)) {
    errors.push(
      `TARGET_STATE must be a 2-letter state code, got: "${env.TARGET_STATE}"`
    );
  }

  // Fail loudly if any validation errors
  if (errors.length > 0) {
    const errorMsg = `[scheduled] CONFIGURATION ERROR:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return { congress, session, targetState };
}

/**
 * Core ingestion logic, separated for use with ctx.waitUntil.
 */
async function runScheduledIngestion(env: Env): Promise<void> {
  const startTime = Date.now();
  console.log("[scheduled] ========================================");
  console.log("[scheduled] Starting scheduled ingestion...");
  console.log(`[scheduled] Cron trigger time: ${new Date().toISOString()}`);

  // Validate configuration (throws on misconfig)
  const config = validateEnv(env);

  console.log("[scheduled] Configuration validated:");
  console.log(`[scheduled]   - Congress: ${config.congress}`);
  console.log(`[scheduled]   - Session: ${config.session}`);
  console.log(`[scheduled]   - Target state: ${config.targetState}`);

  // Run ingestion
  const result = await runIngestion(config);

  if (!result.success) {
    const errorMsg = `[scheduled] Ingestion failed: ${result.error}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (!result.snapshot || !result.meta) {
    const errorMsg = "[scheduled] Ingestion succeeded but no data to publish";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Log target date prominently before publishing
  console.log("[scheduled] ----------------------------------------");
  console.log(`[scheduled] TARGET VOTE DATE: ${result.targetVoteDate}`);
  console.log(`[scheduled] Cutoff date (ET): ${result.cutoffDateEt}`);
  console.log("[scheduled] ----------------------------------------");

  // Publish to R2
  await publishToR2(env.DATA_BUCKET, result.snapshot, result.meta);

  const elapsed = Date.now() - startTime;
  console.log("[scheduled] ========================================");
  console.log("[scheduled] Scheduled ingestion COMPLETE");
  console.log(`[scheduled]   - Target date: ${result.targetVoteDate}`);
  console.log(`[scheduled]   - Votes processed: ${result.votesTotal}`);
  console.log(
    `[scheduled]   - Votes with ${config.targetState} members: ${result.votesWithStateMembers}`
  );
  console.log(`[scheduled]   - State member votes: ${result.stateMemberVotes}`);
  console.log(`[scheduled]   - Partial data: ${result.partial}`);
  if (result.partial && result.missingVotes.length > 0) {
    console.log(
      `[scheduled]   - Missing votes: ${result.missingVotes.join(", ")}`
    );
  }
  console.log(`[scheduled]   - Elapsed: ${elapsed}ms`);
  console.log("[scheduled] ========================================");
}

/**
 * Scheduled handler for cron triggers.
 *
 * Uses ctx.waitUntil to ensure async work completes before the runtime
 * terminates the worker. Fails loudly on configuration errors.
 */
function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): void {
  console.log(
    `[scheduled] Cron scheduled at: ${new Date(controller.scheduledTime).toISOString()}`
  );

  // Use ctx.waitUntil to ensure the async work completes
  // This prevents the runtime from terminating the worker prematurely
  ctx.waitUntil(
    runScheduledIngestion(env).catch((err) => {
      // Log and re-throw to ensure the cron run is marked as failed
      console.error("[scheduled] FATAL: Scheduled ingestion failed");
      console.error("[scheduled] Error:", err instanceof Error ? err.message : String(err));
      if (err instanceof Error && err.stack) {
        console.error("[scheduled] Stack:", err.stack);
      }
      throw err;
    })
  );
}

// ============================================================================
// Export Worker
// ============================================================================

export default {
  fetch: handleFetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;

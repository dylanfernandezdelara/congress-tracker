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

async function handleScheduled(
  _controller: ScheduledController,
  env: Env
): Promise<void> {
  console.log("[scheduled] Starting scheduled ingestion...");

  const config: IngestConfig = {
    congress: parseInt(env.CONGRESS, 10),
    session: parseInt(env.SESSION, 10),
    targetState: env.TARGET_STATE,
  };

  console.log(
    `[scheduled] Config: congress=${config.congress}, session=${config.session}, state=${config.targetState}`
  );

  try {
    const result = await runIngestion(config);

    if (!result.success) {
      console.error(`[scheduled] Ingestion failed: ${result.error}`);
      return;
    }

    if (!result.snapshot || !result.meta) {
      console.error("[scheduled] Ingestion succeeded but no data to publish");
      return;
    }

    // Publish to R2
    await publishToR2(env.DATA_BUCKET, result.snapshot, result.meta);

    console.log("[scheduled] Scheduled ingestion complete");
    console.log(`[scheduled]   - Target date: ${result.targetVoteDate}`);
    console.log(`[scheduled]   - Votes: ${result.votesWithStateMembers}`);
    console.log(`[scheduled]   - Partial: ${result.partial}`);
  } catch (err) {
    console.error("[scheduled] Unhandled error:", err);
    throw err;
  }
}

// ============================================================================
// Export Worker
// ============================================================================

export default {
  fetch: handleFetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;

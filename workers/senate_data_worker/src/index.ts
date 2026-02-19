/**
 * Senate Data Worker - Cloudflare Worker for Senate vote ingestion.
 *
 * Handles:
 * - Scheduled (cron) ingestion of Senate roll-call vote data
 * - HTTP API for serving precomputed JSON from R2
 */

import { runIngestion, runIngestionAllStates, buildVoteLedgerUpdate } from "./ingest";
import { runMemberIngestion } from "./member-ingest";
import type {
  IngestConfig,
  SnapshotJson,
  MetaJson,
  MemberActivityJson,
  MemberIndexJson,
  ActivityIndexJson,
  VoteLedger,
  SessionOverview,
} from "./types";
import { STATE_CODES } from "./states";
import {
  buildLatestKey,
  buildMetaKey,
  buildSnapshotKey,
  buildMemberKeys,
  buildMemberLatestKey,
  buildMembersIndexKey,
  buildActivitiesIndexKey,
  buildVoteLedgerKey,
  buildSessionOverviewKey,
  publishToR2,
  readJsonFromR2,
  writeJsonToR2,
} from "./storage";
import { mapWithConcurrency } from "./concurrency";

// ============================================================================
// Environment Types
// ============================================================================

interface Env {
  DATA_BUCKET: R2Bucket;
  CONGRESS: string;
  SESSION: string;
  TARGET_STATE: string;
  CONGRESS_API_KEY: string;
  GOVINFO_API_KEY: string;
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

  // Match /members/index.json
  if (pathname === "/members/index.json") {
    const key = buildMembersIndexKey();
    const data = await readJsonFromR2<MemberIndexJson>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /activities/index.json
  if (pathname === "/activities/index.json") {
    const key = buildActivitiesIndexKey();
    const data = await readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /votes/ledger.json
  if (pathname === "/votes/ledger.json") {
    const key = buildVoteLedgerKey();
    const data = await readJsonFromR2<VoteLedger>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /stats/overview.json
  if (pathname === "/stats/overview.json") {
    const key = buildSessionOverviewKey();
    const data = await readJsonFromR2<SessionOverview>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /member/{BIOGUIDE}/latest.json
  const memberLatestMatch = pathname.match(/^\/member\/([A-Z]\d{6})\/latest\.json$/);
  if (memberLatestMatch) {
    const bioguide = memberLatestMatch[1];
    const key = buildMemberLatestKey(bioguide);
    const data = await readJsonFromR2<MemberActivityJson>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /member/{BIOGUIDE}/{YYYY-MM-DD}.json
  const memberSnapshotMatch = pathname.match(
    /^\/member\/([A-Z]\d{6})\/(\d{4}-\d{2}-\d{2})\.json$/
  );
  if (memberSnapshotMatch) {
    const bioguide = memberSnapshotMatch[1];
    const date = memberSnapshotMatch[2];
    const key = buildMemberKeys(bioguide, date).snapshot;
    const data = await readJsonFromR2<MemberActivityJson>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheSnapshot },
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
  if (!(targetState === "ALL" || /^[A-Z]{2}$/.test(targetState))) {
    errors.push(
      `TARGET_STATE must be a 2-letter state code or "ALL", got: "${env.TARGET_STATE}"`
    );
  }

  if (!env.CONGRESS_API_KEY) {
    errors.push("CONGRESS_API_KEY is missing");
  }
  if (!env.GOVINFO_API_KEY) {
    errors.push("GOVINFO_API_KEY is missing");
  }

  // Fail loudly if any validation errors
  if (errors.length > 0) {
    const errorMsg = `[scheduled] CONFIGURATION ERROR:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return { congress, session, targetState, congressApiKey: env.CONGRESS_API_KEY };
}

async function publishMemberActivity(
  bucket: R2Bucket,
  membersIndex: MemberIndexJson,
  memberActivities: MemberActivityJson[],
  windowEnd: string,
  activityIndex: ActivityIndexJson | null
): Promise<void> {
  console.log("[r2] Publishing member activity...");

  await writeJsonToR2(bucket, buildMembersIndexKey(), membersIndex);
  if (activityIndex) {
    await writeJsonToR2(bucket, buildActivitiesIndexKey(), activityIndex);
  }

  await mapWithConcurrency(memberActivities, 5, async (activity) => {
    const keys = buildMemberKeys(activity.member.bioguide_id, windowEnd);
    await writeJsonToR2(bucket, keys.snapshot, activity);
    await writeJsonToR2(bucket, keys.latest, activity);
  });

  console.log("[r2] Member activity publish complete");
}

async function publishAllStatesToR2(
  bucket: R2Bucket,
  perState: Record<string, { snapshot: SnapshotJson; meta: MetaJson }>
): Promise<void> {
  const entries = Object.entries(perState);
  await mapWithConcurrency(entries, 4, async ([state, payload]) => {
    console.log(`[r2] Publishing ${state} vote data...`);
    await publishToR2(bucket, payload.snapshot, payload.meta);
  });
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

  console.log("[scheduled] Running member activity ingestion...");
  const memberResult = await runMemberIngestion({
    congress: config.congress,
    session: config.session,
    congressApiKey: env.CONGRESS_API_KEY,
    govInfoApiKey: env.GOVINFO_API_KEY,
  });

  if (!memberResult.success || !memberResult.membersIndex) {
    const errorMsg = `[scheduled] Member ingestion failed: ${memberResult.error ?? "unknown error"}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  await publishMemberActivity(
    env.DATA_BUCKET,
    memberResult.membersIndex,
    memberResult.memberActivities,
    memberResult.windowEnd,
    memberResult.activityIndex
  );

  // Run state ingestion (vote summaries)
  if (config.targetState === "ALL") {
    const result = await runIngestionAllStates(config, STATE_CODES);

    if (!result.success) {
      const errorMsg = `[scheduled] Ingestion failed: ${result.error}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log("[scheduled] ----------------------------------------");
    console.log(`[scheduled] TARGET VOTE DATE: ${result.targetVoteDate}`);
    console.log(`[scheduled] Cutoff date (ET): ${result.cutoffDateEt}`);
    console.log(`[scheduled] States processed: ${Object.keys(result.perState).length}`);
    console.log("[scheduled] ----------------------------------------");

    await publishAllStatesToR2(env.DATA_BUCKET, result.perState);

    // Build/update vote ledger and session overview
    console.log("[scheduled] Building vote ledger...");
    const existingLedger = await readJsonFromR2<VoteLedger>(
      env.DATA_BUCKET, buildVoteLedgerKey()
    );
    const { ledger, overview } = await buildVoteLedgerUpdate(
      config, memberResult.membersIndex, existingLedger
    );
    await writeJsonToR2(env.DATA_BUCKET, buildVoteLedgerKey(), ledger);
    await writeJsonToR2(env.DATA_BUCKET, buildSessionOverviewKey(), overview);
    console.log(`[scheduled] Ledger: ${ledger.total_votes} votes, Overview: ${overview.total_defections} defections`);

    const elapsed = Date.now() - startTime;
    console.log("[scheduled] ========================================");
    console.log("[scheduled] Scheduled ingestion COMPLETE");
    console.log(`[scheduled]   - Target date: ${result.targetVoteDate}`);
    console.log(`[scheduled]   - Votes processed: ${result.votesTotal}`);
    console.log(`[scheduled]   - States processed: ${Object.keys(result.perState).length}`);
    console.log(`[scheduled]   - Partial data: ${result.partial}`);
    if (result.partial && result.missingVotes.length > 0) {
      console.log(
        `[scheduled]   - Missing votes: ${result.missingVotes.join(", ")}`
      );
    }
    console.log(`[scheduled]   - Elapsed: ${elapsed}ms`);
    console.log("[scheduled] ========================================");
  } else {
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

    console.log("[scheduled] ----------------------------------------");
    console.log(`[scheduled] TARGET VOTE DATE: ${result.targetVoteDate}`);
    console.log(`[scheduled] Cutoff date (ET): ${result.cutoffDateEt}`);
    console.log("[scheduled] ----------------------------------------");

    await publishToR2(env.DATA_BUCKET, result.snapshot, result.meta);

    // Build/update vote ledger and session overview
    console.log("[scheduled] Building vote ledger...");
    const existingLedger = await readJsonFromR2<VoteLedger>(
      env.DATA_BUCKET, buildVoteLedgerKey()
    );
    const { ledger, overview } = await buildVoteLedgerUpdate(
      config, memberResult.membersIndex, existingLedger
    );
    await writeJsonToR2(env.DATA_BUCKET, buildVoteLedgerKey(), ledger);
    await writeJsonToR2(env.DATA_BUCKET, buildSessionOverviewKey(), overview);
    console.log(`[scheduled] Ledger: ${ledger.total_votes} votes, Overview: ${overview.total_defections} defections`);

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

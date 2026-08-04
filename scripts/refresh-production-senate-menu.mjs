#!/usr/bin/env node
/**
 * Refresh production's Senate LIS vote-menu cache from a host that can reach
 * senate.gov (Cloudflare Worker egress is often HTTP 403 / Akamai-blocked).
 *
 * Preferred — POST XML to the Worker admin route (needs PIPELINE_ADMIN_TOKEN):
 *   PIPELINE_ADMIN_TOKEN=... npm run refresh:senate-menu
 *
 * Break-glass — write D1 `pipeline_state` directly (needs CLOUDFLARE_API_TOKEN):
 *   REFRESH_VIA=d1 npm run refresh:senate-menu
 *   (RUN_FEED is not supported in D1 mode; exits 2 if set.)
 *
 * Optional:
 *   CONGRESS / SESSION   — default 119 / 2 (must match Worker vars)
 *   RUN_FEED=1           — chain feed ingest after cache write (admin mode only)
 *   WORKER_BASE_URL=...  — default workers.dev (custom domain Bot Fight challenges curl;
 *                          requires workers_dev=true in wrangler.toml)
 *   D1_DATABASE_ID=...   — override production D1 id (defaults to wrangler.toml id)
 *   CHECK_HEALTH=1       — fail on failed/stale/unknown (degraded is expected while
 *                          Worker→Senate.gov stays 403, even after a good cache refresh).
 *                          Falls back to D1 pipeline_state when /health is unreachable
 *                          (Bot Fight / workers.dev disabled).
 *   ADMIN_FALLBACK_D1=1  — if admin HTTP fails, retry via D1 (default on; set 0 to disable)
 *
 * Exit codes: 0 success, 1 blocker / unhealthy, 2 misuse / missing secrets.
 *
 * Menu encode/validate helpers are duplicated from shared/senate-vote-menu.ts so
 * this script stays plain Node 20 (no strip-types / tsx). Ingest status evaluation
 * is imported from shared/ingest-monitor-eval.mjs (single source with the Worker).
 */

import {
  buildSenateVoteMenuCacheMonitor,
  evaluateIngestMonitorStatus,
  FEED_PIPELINE_STALE_HOURS,
  isIngestMonitorOpsAcceptable,
  resolveScheduledSuccess,
} from "../shared/ingest-monitor-eval.mjs";

const DEFAULT_WORKER_BASE =
  "https://congress-tracker-api.fernandezdelaradylan.workers.dev";

/** Keep in sync with shared/senate-vote-menu.ts + wrangler.toml production database_id. */
const PRODUCTION_D1_DATABASE_ID = "e21fa2df-1c7d-4a83-8044-f28803c80a26";

const SENATE_VOTE_MENU_CACHE_UPSERT_SQL =
  "INSERT INTO pipeline_state (key, value_json, updated_at) VALUES (?1, ?2, ?3) " +
  "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at";

function senateVoteMenuUrl(congress, session) {
  return `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
}

function senateVoteMenuCacheKey(congress, session) {
  return `senate_vote_menu_cache_${congress}_${session}`;
}

function encodeSenateVoteMenuCacheValue(xml, fetchedAt = new Date().toISOString()) {
  return {
    fetchedAt,
    valueJson: JSON.stringify({ fetched_at: fetchedAt, xml }),
  };
}

/** Keep in sync with shared/senate-vote-menu.ts `isSenateVoteMenuXml`. */
function isSenateVoteMenuXml(xml, opts) {
  const trimmed = xml.trim();
  if (
    !trimmed.includes("<vote_summary>") ||
    !trimmed.includes("</vote_summary>") ||
    !trimmed.includes("<vote>") ||
    !trimmed.includes("<vote_number>") ||
    !trimmed.includes("<congress>") ||
    !trimmed.includes("<session>")
  ) {
    return false;
  }

  const congressMatch = trimmed.match(/<congress>\s*(\d+)\s*<\/congress>/i);
  const sessionMatch = trimmed.match(/<session>\s*(\d+)\s*<\/session>/i);
  if (!congressMatch || !sessionMatch) return false;

  const congress = Number.parseInt(congressMatch[1], 10);
  const session = Number.parseInt(sessionMatch[1], 10);
  if (!Number.isFinite(congress) || !Number.isFinite(session)) return false;

  if (opts?.congress !== undefined && congress !== opts.congress) return false;
  if (opts?.session !== undefined && session !== opts.session) return false;

  const voteNumbers = [...trimmed.matchAll(/<vote_number>\s*(\d+)\s*<\/vote_number>/gi)];
  return voteNumbers.length >= 1;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(2);
  }
  return value;
}

function resolveCongressSession() {
  const congress = Number.parseInt(process.env.CONGRESS?.trim() || "119", 10);
  const session = Number.parseInt(process.env.SESSION?.trim() || "2", 10);
  if (!Number.isFinite(congress) || !Number.isFinite(session)) {
    console.error("CONGRESS and SESSION must be integers");
    process.exit(2);
  }
  return { congress, session };
}

function resolveD1DatabaseId() {
  return process.env.D1_DATABASE_ID?.trim() || PRODUCTION_D1_DATABASE_ID;
}

async function fetchSenateMenuXml(congress, session) {
  const url = senateVoteMenuUrl(congress, session);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "congress-tracker-ops/1.0",
      Accept: "application/xml,text/xml,*/*;q=0.8",
      Referer: "https://www.senate.gov/legislative/votes_new.htm",
    },
  });
  if (!res.ok) {
    throw new Error(`Senate menu HTTP ${res.status} for ${url}`);
  }
  const xml = await res.text();
  if (!isSenateVoteMenuXml(xml, { congress, session })) {
    throw new Error("Senate menu response failed structural/congress validation");
  }
  return xml;
}

function adminFallbackD1Enabled() {
  return process.env.ADMIN_FALLBACK_D1?.trim() !== "0";
}

/**
 * Fallback only when the admin host is unreachable / not serving the Worker.
 * Never fall back on parseable JSON application errors (e.g. pipeline_failed
 * after a menu write) — those are real failures, not transport problems.
 */
function shouldFallbackAdminToD1(res, body) {
  if (!adminFallbackD1Enabled()) return false;
  if (res.status === 404) return true;
  // Non-JSON (Bot Fight HTML, workers.dev error pages, etc.)
  return typeof body?.raw === "string";
}

async function fallbackAdminRefreshToD1(xml, congress, session, meta) {
  const runFeed = Boolean(meta.runFeed);
  console.warn(
    JSON.stringify({
      event: meta.event,
      ...meta.details,
      fallback: "d1",
      run_feed_skipped: runFeed,
    })
  );
  const d1Base = await refreshViaD1(xml, congress, session, {
    fromAdminFallback: true,
  });
  if (runFeed) {
    console.error(
      JSON.stringify({
        event: "senate_vote_menu_run_feed_skipped",
        reason: meta.runFeedSkipReason,
        hint: "Cache written via D1; trigger POST /__pipeline/run/feed when the admin route is healthy, or wait for daily cron.",
      })
    );
    process.exit(1);
  }
  return d1Base;
}

async function refreshViaAdmin(xml, congress, session) {
  const token = requireEnv("PIPELINE_ADMIN_TOKEN");
  const base = (process.env.WORKER_BASE_URL || DEFAULT_WORKER_BASE).replace(/\/$/, "");
  const runFeed = process.env.RUN_FEED === "1";
  const url = `${base}/__pipeline/senate-vote-menu${runFeed ? "?run_feed=1" : ""}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/xml",
      },
      body: xml,
    });
  } catch (err) {
    if (adminFallbackD1Enabled()) {
      return fallbackAdminRefreshToD1(xml, congress, session, {
        event: "senate_vote_menu_admin_unreachable",
        details: { error: err instanceof Error ? err.message : String(err) },
        runFeed,
        runFeedSkipReason: "admin_unreachable_d1_cache_only",
      });
    }
    throw err;
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok || body?.ok !== true) {
    if (shouldFallbackAdminToD1(res, body)) {
      return fallbackAdminRefreshToD1(xml, congress, session, {
        event: "senate_vote_menu_admin_failed",
        details: { http_status: res.status, body },
        runFeed,
        runFeedSkipReason: "admin_failed_d1_cache_only",
      });
    }
    console.error("Admin senate-vote-menu failed", res.status, body);
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      event: "senate_vote_menu_refreshed",
      mode: "admin",
      congress,
      session,
      fetched_at: body.fetched_at,
      run_feed: Boolean(body.run_feed),
      votesUpserted: body.feed?.votesUpserted,
    })
  );
  return base;
}

async function d1Query(sql, params = []) {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
  const databaseId = resolveD1DatabaseId();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const body = await res.json();
  if (!res.ok || body?.success !== true) {
    throw new Error(`D1 query failed: ${res.status} ${JSON.stringify(body?.errors ?? body)}`);
  }
  return body.result?.[0]?.results ?? [];
}

async function refreshViaD1(xml, congress, session, options = {}) {
  // Direct REFRESH_VIA=d1 + RUN_FEED=1 is misuse (no HTTP path to chain feed).
  // Admin→D1 fallback may still write the cache when RUN_FEED was requested.
  if (process.env.RUN_FEED === "1" && process.env.REFRESH_VIA?.toLowerCase() === "d1" && !options.fromAdminFallback) {
    console.error(
      "RUN_FEED=1 is not supported with REFRESH_VIA=d1. Use admin mode (PIPELINE_ADMIN_TOKEN) or trigger feed separately."
    );
    process.exit(2);
  }
  const databaseId = resolveD1DatabaseId();
  const { fetchedAt, valueJson } = encodeSenateVoteMenuCacheValue(xml);
  const cacheKey = senateVoteMenuCacheKey(congress, session);
  try {
    await d1Query(SENATE_VOTE_MENU_CACHE_UPSERT_SQL, [cacheKey, valueJson, fetchedAt]);
  } catch (err) {
    console.error("D1 cache write failed", err instanceof Error ? err.message : err);
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      event: "senate_vote_menu_refreshed",
      mode: "d1",
      congress,
      session,
      database_id: databaseId,
      cache_key: cacheKey,
      fetched_at: fetchedAt,
      note: "Cache updated; trigger POST /__pipeline/run/feed (or wait for daily cron) to ingest new rolls.",
    })
  );
  return (process.env.WORKER_BASE_URL || DEFAULT_WORKER_BASE).replace(/\/$/, "");
}

/**
 * Evaluate feed ingest status from D1 when /health is unreachable
 * (workers.dev disabled or Bot Fight on the custom domain).
 * Uses the same evaluator as the Worker (`shared/ingest-monitor-eval.mjs`).
 */
async function checkHealthViaD1(congress, session) {
  const menuKey = senateVoteMenuCacheKey(congress, session);
  const rows = await d1Query(
    "SELECT key, value_json FROM pipeline_state WHERE key IN (?1, ?2, ?3, ?4)",
    [
      "feed_pipeline_last_scheduled_success",
      "feed_pipeline_last_success",
      "feed_pipeline_last_failure",
      menuKey,
    ]
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value_json]));
  const parse = (key) => {
    if (!byKey[key]) return null;
    try {
      return JSON.parse(byKey[key]);
    } catch {
      return null;
    }
  };

  const scheduled = parse("feed_pipeline_last_scheduled_success");
  const latest = parse("feed_pipeline_last_success");
  const failure = parse("feed_pipeline_last_failure");
  const menuRow = parse(menuKey);
  const now = new Date();
  const scheduledSuccess = resolveScheduledSuccess(scheduled, latest);
  const newest = latest ?? scheduledSuccess;
  const senateVoteMenuCache = buildSenateVoteMenuCacheMonitor(menuRow?.fetched_at, now);
  const evaluated = evaluateIngestMonitorStatus({
    now,
    staleAfterHours: FEED_PIPELINE_STALE_HOURS,
    scheduledSuccess,
    lastFailure: failure,
    chamberWarnings: newest?.chamber_warnings ?? [],
    senateVoteMenuCache,
  });

  console.log(
    JSON.stringify({
      event: "ingest_health_check",
      mode: "d1",
      ingest_status: evaluated.status,
      message: evaluated.message,
      latest_passage_hint: latest?.completed_at ?? null,
      senate_vote_menu_cache: senateVoteMenuCache,
    })
  );
  if (!isIngestMonitorOpsAcceptable(evaluated.status)) {
    process.exit(1);
  }
}

async function checkHealth(base, congress, session) {
  try {
    const res = await fetch(`${base}/health`);
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      console.warn(
        JSON.stringify({
          event: "ingest_health_http_unusable",
          http_status: res.status,
          fallback: "d1",
          preview: text.slice(0, 120),
        })
      );
      await checkHealthViaD1(congress, session);
      return;
    }
    const ingestStatus = body?.data?.ingest?.status;
    console.log(
      JSON.stringify({
        event: "ingest_health_check",
        mode: "http",
        http_status: res.status,
        top_status: body?.status,
        ingest_status: ingestStatus,
        latest_passage_vote_date: body?.data?.ingest?.latest_passage_vote_date,
        senate_vote_menu_cache: body?.data?.ingest?.senate_vote_menu_cache ?? null,
        message: body?.data?.ingest?.message,
      })
    );
    // Accept ok | degraded; page on failed/stale/unknown (see docs/MONITORING.md).
    if (!res.ok || !isIngestMonitorOpsAcceptable(ingestStatus)) {
      process.exit(1);
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "ingest_health_http_error",
        error: err instanceof Error ? err.message : String(err),
        fallback: "d1",
      })
    );
    await checkHealthViaD1(congress, session);
  }
}

async function main() {
  const { congress, session } = resolveCongressSession();

  if (process.env.REFRESH_PRINT_ONLY === "1") {
    process.stdout.write(
      [
        "refresh-production-senate-menu",
        senateVoteMenuUrl(congress, session),
        senateVoteMenuCacheKey(congress, session),
        PRODUCTION_D1_DATABASE_ID,
        "/__pipeline/senate-vote-menu",
        "RUN_FEED",
        "CHECK_HEALTH",
        "ADMIN_FALLBACK_D1",
        "REFRESH_VIA",
        "CONGRESS",
        "SESSION",
        "D1_DATABASE_ID",
      ].join("\n") + "\n"
    );
    return;
  }

  const xml = await fetchSenateMenuXml(congress, session);
  const mode = (process.env.REFRESH_VIA || "admin").toLowerCase();
  const base =
    mode === "d1"
      ? await refreshViaD1(xml, congress, session)
      : await refreshViaAdmin(xml, congress, session);

  if (process.env.CHECK_HEALTH === "1") {
    await checkHealth(base, congress, session);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

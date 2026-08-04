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
 * Menu helpers below are intentionally duplicated from shared/senate-vote-menu.ts so
 * this script stays plain Node 20 (no strip-types / tsx). Keep in sync.
 */

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

/** Keep in sync with shared/ingest-monitor-status.ts `isIngestMonitorOpsAcceptable`. */
function isIngestMonitorOpsAcceptable(status) {
  return status === "ok" || status === "degraded";
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
    if (adminFallbackD1Enabled() && !runFeed) {
      console.warn(
        JSON.stringify({
          event: "senate_vote_menu_admin_unreachable",
          error: err instanceof Error ? err.message : String(err),
          fallback: "d1",
        })
      );
      return refreshViaD1(xml, congress, session);
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
    if (adminFallbackD1Enabled() && !runFeed && (res.status === 404 || res.status >= 500 || typeof body?.raw === "string")) {
      console.warn(
        JSON.stringify({
          event: "senate_vote_menu_admin_failed",
          http_status: res.status,
          body,
          fallback: "d1",
        })
      );
      return refreshViaD1(xml, congress, session);
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

async function refreshViaD1(xml, congress, session) {
  if (process.env.RUN_FEED === "1") {
    console.error(
      "RUN_FEED=1 is not supported with REFRESH_VIA=d1. Use admin mode (PIPELINE_ADMIN_TOKEN) or trigger feed separately."
    );
    process.exit(2);
  }
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
  const databaseId = resolveD1DatabaseId();
  const { fetchedAt, valueJson } = encodeSenateVoteMenuCacheValue(xml);
  const cacheKey = senateVoteMenuCacheKey(congress, session);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: SENATE_VOTE_MENU_CACHE_UPSERT_SQL,
        params: [cacheKey, valueJson, fetchedAt],
      }),
    }
  );
  const body = await res.json();
  if (!res.ok || body?.success !== true) {
    console.error("D1 cache write failed", res.status, body);
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

/** Keep in sync with workers FEED_PIPELINE_STALE_HOURS. */
const FEED_PIPELINE_STALE_HOURS = 26;

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

/**
 * Evaluate feed ingest status from D1 when /health is unreachable
 * (workers.dev disabled or Bot Fight on the custom domain).
 * Keep severity rules aligned with shared/ingest-monitor-status.ts + ingest-health.ts.
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
  const menu = parse(menuKey);
  const now = Date.now();

  let status = "unknown";
  let message = "No successful scheduled ingest recorded yet.";

  const scheduledOk = scheduled?.trigger === "scheduled" ? scheduled : null;
  const scheduledFail = failure?.trigger === "scheduled" ? failure : null;
  if (
    scheduledFail &&
    (!scheduledOk || Date.parse(scheduledFail.failed_at) > Date.parse(scheduledOk.completed_at))
  ) {
    status = "failed";
    message = `Last scheduled ingest failed: ${scheduledFail.error}`;
  } else if (!scheduledOk) {
    status = "unknown";
  } else {
    const ageH = (now - Date.parse(scheduledOk.completed_at)) / (60 * 60 * 1000);
    if (ageH > FEED_PIPELINE_STALE_HOURS) {
      status = "stale";
      message = `Last scheduled ingest was ${scheduledOk.completed_at}`;
    } else {
      const warnings = (latest ?? scheduledOk).chamber_warnings ?? [];
      if (warnings.some((w) => /ingest skipped:/i.test(String(w)))) {
        status = "failed";
        message = `Partial chamber ingest: ${warnings.join("; ")}`;
      } else if (
        warnings.length > 0 &&
        warnings.every((w) => /served from D1 cache after live fetch failed/i.test(String(w)))
      ) {
        status = "degraded";
        message = `Partial chamber ingest: ${warnings.join("; ")}`;
      } else if (warnings.length > 0) {
        status = "failed";
        message = `Partial chamber ingest: ${warnings.join("; ")}`;
      } else {
        status = "ok";
        message = "Scheduled ingest completed within the expected window.";
      }
    }
  }

  let menuAgeHours = null;
  if (menu?.fetched_at) {
    menuAgeHours = Math.round(((now - Date.parse(menu.fetched_at)) / (60 * 60 * 1000)) * 10) / 10;
    if (menuAgeHours > 6 * 24 && isIngestMonitorOpsAcceptable(status)) {
      status = "failed";
      message = `Senate vote menu D1 cache nearing expiry (age ${menuAgeHours}h)`;
    } else if (menuAgeHours > 48 && status === "ok") {
      status = "degraded";
      message = `Senate vote menu D1 cache is stale (age ${menuAgeHours}h)`;
    }
  }

  console.log(
    JSON.stringify({
      event: "ingest_health_check",
      mode: "d1",
      ingest_status: status,
      message,
      latest_passage_hint: latest?.completed_at ?? null,
      senate_menu_cache_age_hours: menuAgeHours,
    })
  );
  if (!isIngestMonitorOpsAcceptable(status)) {
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

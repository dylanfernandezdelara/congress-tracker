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
 *   WORKER_BASE_URL=...  — default workers.dev (custom domain Bot Fight challenges curl)
 *   D1_DATABASE_ID=...   — override production D1 id (defaults to wrangler.toml id)
 *   CHECK_HEALTH=1       — fail on failed/stale/unknown (degraded is expected while
 *                          Worker→Senate.gov stays 403, even after a good cache refresh)
 *
 * Exit codes: 0 success, 1 blocker / unhealthy, 2 misuse / missing secrets.
 */
import { isIngestMonitorOpsAcceptable } from "../shared/ingest-monitor-status.mjs";
import {
  encodeSenateVoteMenuCacheValue,
  isSenateVoteMenuXml,
  PRODUCTION_D1_DATABASE_ID,
  SENATE_VOTE_MENU_CACHE_UPSERT_SQL,
  senateVoteMenuCacheKey,
  senateVoteMenuUrl,
} from "../shared/senate-vote-menu.mjs";

const DEFAULT_WORKER_BASE =
  "https://congress-tracker-api.fernandezdelaradylan.workers.dev";

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

async function refreshViaAdmin(xml, congress, session) {
  const token = requireEnv("PIPELINE_ADMIN_TOKEN");
  const base = (process.env.WORKER_BASE_URL || DEFAULT_WORKER_BASE).replace(/\/$/, "");
  const runFeed = process.env.RUN_FEED === "1";
  const url = `${base}/__pipeline/senate-vote-menu${runFeed ? "?run_feed=1" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/xml",
    },
    body: xml,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok || body?.ok !== true) {
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

async function checkHealth(base) {
  const res = await fetch(`${base}/health`);
  const body = await res.json();
  const ingestStatus = body?.data?.ingest?.status;
  console.log(
    JSON.stringify({
      event: "ingest_health_check",
      http_status: res.status,
      top_status: body?.status,
      ingest_status: ingestStatus,
      latest_passage_vote_date: body?.data?.ingest?.latest_passage_vote_date,
      message: body?.data?.ingest?.message,
    })
  );
  // Accept ok | degraded; page on failed/stale/unknown (see docs/MONITORING.md).
  if (!res.ok || !isIngestMonitorOpsAcceptable(ingestStatus)) {
    process.exit(1);
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
    await checkHealth(base);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

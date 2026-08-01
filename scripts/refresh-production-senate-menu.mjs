#!/usr/bin/env node
/**
 * Refresh production's Senate LIS vote-menu cache from a host that can reach
 * senate.gov (Cloudflare Worker egress is often HTTP 403 / Akamai-blocked).
 *
 * Modes:
 * 1) Preferred — POST XML to the Worker admin route (needs PIPELINE_ADMIN_TOKEN):
 *      PIPELINE_ADMIN_TOKEN=... node scripts/refresh-production-senate-menu.mjs
 * 2) Fallback — write D1 `pipeline_state` directly (needs CLOUDFLARE_API_TOKEN):
 *      REFRESH_VIA=d1 node scripts/refresh-production-senate-menu.mjs
 *
 * Optional:
 *   RUN_FEED=1          — chain feed ingest after cache write (admin mode only)
 *   WORKER_BASE_URL=... — default https://congress-tracker-api.fernandezdelaradylan.workers.dev
 *                         (custom domain Bot Fight Mode challenges non-browser clients)
 *   CHECK_HEALTH=1      — GET /health and exit 1 when data.ingest.status !== ok
 *
 * Exit codes: 0 success, 1 blocker / unhealthy, 2 misuse / missing secrets.
 */
import { writeFileSync } from "node:fs";

const SENATE_MENU_URL =
  "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml";
const DEFAULT_WORKER_BASE =
  "https://congress-tracker-api.fernandezdelaradylan.workers.dev";
const D1_DATABASE_ID = "e21fa2df-1c7d-4a83-8044-f28803c80a26";
const CACHE_KEY = "senate_vote_menu_cache_119_2";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(2);
  }
  return value;
}

function isSenateVoteMenuXml(xml) {
  const trimmed = xml.trim();
  return (
    trimmed.includes("<vote_summary>") &&
    trimmed.includes("</vote_summary>") &&
    trimmed.includes("<vote>")
  );
}

async function fetchSenateMenuXml() {
  const res = await fetch(SENATE_MENU_URL, {
    headers: {
      "User-Agent": "congress-tracker-ops/1.0",
      Accept: "application/xml,text/xml,*/*;q=0.8",
      Referer: "https://www.senate.gov/legislative/votes_new.htm",
    },
  });
  if (!res.ok) {
    throw new Error(`Senate menu HTTP ${res.status} for ${SENATE_MENU_URL}`);
  }
  const xml = await res.text();
  if (!isSenateVoteMenuXml(xml)) {
    throw new Error("Senate menu response was not vote_summary XML");
  }
  return xml;
}

async function refreshViaAdmin(xml) {
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
      fetched_at: body.fetched_at,
      run_feed: Boolean(body.run_feed),
      votesUpserted: body.feed?.votesUpserted,
    })
  );
  return base;
}

async function refreshViaD1(xml) {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
  const fetchedAt = new Date().toISOString();
  const valueJson = JSON.stringify({ fetched_at: fetchedAt, xml });
  const sql =
    "INSERT INTO pipeline_state (key, value_json, updated_at) VALUES (?1, ?2, ?3) " +
    "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at";
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql,
        params: [CACHE_KEY, valueJson, fetchedAt],
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
  if (!res.ok || ingestStatus !== "ok") {
    process.exit(1);
  }
}

async function main() {
  if (process.env.REFRESH_PRINT_ONLY === "1") {
    // Contract-test helper: no network.
    process.stdout.write(
      [
        "refresh-production-senate-menu",
        SENATE_MENU_URL,
        CACHE_KEY,
        "/__pipeline/senate-vote-menu",
        "RUN_FEED",
        "CHECK_HEALTH",
        "REFRESH_VIA",
      ].join("\n") + "\n"
    );
    return;
  }

  const xml = await fetchSenateMenuXml();
  const mode = (process.env.REFRESH_VIA || "admin").toLowerCase();
  const base =
    mode === "d1" ? await refreshViaD1(xml) : await refreshViaAdmin(xml);

  if (process.env.CHECK_HEALTH === "1") {
    await checkHealth(base);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

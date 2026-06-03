/**
 * Print Senate votes as the materialized briefing would order them (newest date first).
 *
 * Usage (API worker must be running with current briefing):
 *   API_URL=http://127.0.0.1:8787 SINCE_DAYS=21 npx tsx scripts/print-briefing-feed.ts
 *
 * Env:
 *   API_URL      — default http://127.0.0.1:8787
 *   SINCE_DAYS   — if set, only votes on or after (today − N) UTC
 *   TOP_N        — max rows (default full chronological list after date sort)
 */

import type { BriefingFeedResponse } from "../src/platform-types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function filterBriefingBySinceDays(briefing: BriefingFeedResponse, sinceDays: number): BriefingFeedResponse {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - sinceDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const items = briefing.items.filter((item) => item.vote_date >= cutoffStr);
  return { ...briefing, items };
}

async function main(): Promise<void> {
  const api = (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const sinceDaysRaw = process.env.SINCE_DAYS;
  const sinceDays =
    sinceDaysRaw !== undefined && sinceDaysRaw !== ""
      ? Math.max(1, parseInt(sinceDaysRaw, 10) || 1)
      : null;
  const topN = process.env.TOP_N ? parseInt(process.env.TOP_N, 10) : undefined;

  const briefingRaw = await fetchJson<BriefingFeedResponse>(`${api}/briefings/latest.json`);
  const briefing =
    sinceDays !== null ? filterBriefingBySinceDays(briefingRaw, sinceDays) : briefingRaw;

  if (briefing.items.length === 0) {
    if (sinceDays !== null) {
      console.error(`No votes on or after the last ${sinceDays} day(s) in the current briefing.`);
      console.error(`Briefing has ${briefingRaw.items.length} total items; omit SINCE_DAYS to use all, or widen the window.`);
    } else {
      console.error("Briefing has no items.");
    }
    process.exit(1);
  }

  const rows = topN !== undefined && !Number.isNaN(topN) ? briefing.items.slice(0, topN) : briefing.items;

  console.log(`API: ${api}`);
  console.log(
    sinceDays !== null
      ? `Votes in window (last ${sinceDays} days): ${briefing.items.length}`
      : `Votes in briefing (no date filter): ${briefing.items.length}`
  );
  console.log(`Generated at: ${briefing.generated_at}`);
  console.log("");

  for (const item of rows) {
    console.log(
      `${item.vote_date}  #${item.vote_number}  ${item.status.padEnd(8)}  ${item.title}`
    );
    console.log(`  ${item.summary}`);
    console.log(`  ${item.detail_path}`);
    console.log("");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

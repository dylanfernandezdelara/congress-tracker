/**
 * Print Senate votes as the materialized briefing would order them (newest date first).
 *
 * Usage (API worker must be running with current ledger):
 *   API_URL=http://127.0.0.1:8787 SINCE_DAYS=21 npx tsx scripts/print-briefing-feed.ts
 *
 * Env:
 *   API_URL      — default http://127.0.0.1:8787
 *   SINCE_DAYS   — if set, only votes on or after (today − N) UTC
 *   TOP_N        — max rows (default full chronological list after date sort)
 */

import type { ActivityIndexJson, SessionOverview, VoteLedger } from "../src/types";
import { BRIEFING_FEED_ITEM_LIMIT, buildBriefingFeedItemsSortedByDate } from "../src/read-model";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function filterLedgerBySinceDays(ledger: VoteLedger, sinceDays: number): VoteLedger {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - sinceDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const entries = ledger.entries.filter((e) => e.vote_date >= cutoffStr);
  return {
    ...ledger,
    entries,
    total_votes: entries.length,
  };
}

async function main(): Promise<void> {
  const api = (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const sinceDaysRaw = process.env.SINCE_DAYS;
  const sinceDays =
    sinceDaysRaw !== undefined && sinceDaysRaw !== ""
      ? Math.max(1, parseInt(sinceDaysRaw, 10) || 1)
      : null;
  const topN = process.env.TOP_N ? parseInt(process.env.TOP_N, 10) : undefined;

  const [ledgerRaw, overview] = await Promise.all([
    fetchJson<VoteLedger>(`${api}/votes/ledger.json`),
    fetchJson<SessionOverview>(`${api}/stats/overview.json`),
  ]);

  let activities: ActivityIndexJson | null = null;
  try {
    activities = await fetchJson<ActivityIndexJson>(`${api}/activities/index.json`);
  } catch {
    activities = null;
  }

  const ledger =
    sinceDays !== null ? filterLedgerBySinceDays(ledgerRaw, sinceDays) : { ...ledgerRaw, entries: [...ledgerRaw.entries] };
  if (ledger.entries.length === 0) {
    if (sinceDays !== null) {
      console.error(`No votes on or after the last ${sinceDays} day(s) in the current ledger.`);
      console.error(`Ledger has ${ledgerRaw.entries.length} total votes; omit SINCE_DAYS to use all, or widen the window.`);
    } else {
      console.error("Ledger has no votes.");
    }
    process.exit(1);
  }

  const { sorted } = buildBriefingFeedItemsSortedByDate(ledger, overview, activities);
  const briefingCap = sorted.slice(0, BRIEFING_FEED_ITEM_LIMIT);
  const inBriefing = new Set(briefingCap.map((i) => i.id));

  const rows = topN !== undefined && !Number.isNaN(topN) ? sorted.slice(0, topN) : sorted;

  console.log(`API: ${api}`);
  console.log(
    sinceDays !== null
      ? `Votes in window (last ${sinceDays} days): ${ledger.entries.length}`
      : `Votes in ledger (no date filter): ${ledger.entries.length}`
  );
  console.log(`Homepage briefing cap (${BRIEFING_FEED_ITEM_LIMIT} newest): ${briefingCap.map((h) => h.vote_number).join(", ") || "(none)"}`);
  console.log("");
  console.log(
    ["seq".padEnd(5), "vote".padEnd(6), "date".padEnd(12), "feed?".padEnd(6), "conf".padEnd(7), "summary / plain_action"].join(" ")
  );
  console.log("-".repeat(120));

  let seq = 0;
  for (const item of rows) {
    seq += 1;
    const title = (item.summary || item.plain_action || item.title).replace(/\s+/g, " ").slice(0, 88);
    const line = [
      String(seq).padEnd(5),
      String(item.vote_number).padEnd(6),
      item.vote_date.padEnd(12),
      (inBriefing.has(item.id) ? "yes" : "no").padEnd(6),
      item.content_confidence.padEnd(7),
      title,
    ].join(" ");
    console.log(line);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

import type {
  AdvancingBillItem,
  AdvancingBillsResponse,
} from "../../../../shared/stats-api-types";
import { PROCESS_ADVANCING_DAYS } from "../constants";
import type { Env } from "../config";
import {
  getProcessSummariesForBills,
  processMapKey,
  selectAdvancingProcessBills,
} from "../d1/bill-process";
import type { FeedBillRow } from "../d1/votes";
import { lookbackStartIso } from "../sources/congress-client";
import { buildFeedItemsForBills } from "./feed";
import { EXECUTIVE_SIGNAL_LOOKBACK_DAYS } from "../constants";

export async function buildAdvancingBills(
  env: Env,
  congress: number,
  session: number,
  limit: number,
  asOf: string = new Date().toISOString()
): Promise<AdvancingBillsResponse> {
  const since = lookbackStartIso(PROCESS_ADVANCING_DAYS, new Date(asOf));
  // lookbackStartIso returns YYYY-MM-DD; compare as ISO day start.
  const sinceIso = `${since}T00:00:00.000Z`;
  const rows = await selectAdvancingProcessBills(env.DB, congress, sinceIso, limit);

  if (rows.length === 0) {
    return { congress, session, items: [], as_of: asOf };
  }

  const keys = rows.map((r) => ({
    congress: r.congress,
    billType: r.bill_type,
    billNumber: r.bill_number,
  }));
  const summaries = await getProcessSummariesForBills(env.DB, keys);

  const feedRows: FeedBillRow[] = rows.map((r) => ({
    bill_congress: r.congress,
    bill_type: r.bill_type,
    bill_number: r.bill_number,
    latest_passage_date: null,
    latest_activity_date: r.last_advance_at ?? asOf.slice(0, 10),
  }));

  const executiveSince = lookbackStartIso(EXECUTIVE_SIGNAL_LOOKBACK_DAYS);
  const items = await buildFeedItemsForBills(env, feedRows, {
    now: asOf,
    executiveSince,
  });

  const out: AdvancingBillItem[] = rows.map((r, index) => {
    const key = processMapKey(r.congress, r.bill_type, r.bill_number);
    return {
      congress: r.congress,
      bill_type: r.bill_type,
      bill_number: r.bill_number,
      title: r.title ?? null,
      policy_area: r.policy_area ?? null,
      headline: r.headline ?? null,
      last_advance_at: r.last_advance_at ?? asOf,
      current_label: r.current_label,
      process: summaries.get(key) ?? null,
      item: items[index] ?? null,
    };
  });

  return { congress, session, items: out, as_of: asOf };
}

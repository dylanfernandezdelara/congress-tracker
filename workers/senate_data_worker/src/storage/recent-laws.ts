import { EXECUTIVE_SIGNAL_LOOKBACK_DAYS } from "../constants";
import type { Env } from "../config";
import { selectRecentlyEnactedBills } from "../d1/lifecycle";
import type { FeedBillRow } from "../d1/votes";
import { lookbackStartIso } from "../sources/congress-client";
import type { RecentLawItem, RecentLawsResponse } from "../../../../shared/laws-api-types";
import { buildFeedItemsForBills } from "./feed";

export type { RecentLawItem, RecentLawsResponse };

function maxIsoDate(...dates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const date of dates) {
    if (!date) continue;
    if (best === null || date > best) best = date;
  }
  return best;
}

function feedBillRowsForLaws(laws: RecentLawItem[]): FeedBillRow[] {
  return laws.map((law) => ({
    bill_congress: law.congress,
    bill_type: law.bill_type,
    bill_number: law.bill_number,
    latest_passage_date: law.latest_passage_vote_date,
    latest_activity_date:
      maxIsoDate(law.latest_passage_vote_date, law.latest_action_date) ?? "",
  }));
}

export async function buildRecentLaws(
  env: Env,
  congress: number,
  session: number,
  limit: number,
  asOf: string = new Date().toISOString()
): Promise<RecentLawsResponse> {
  const laws = await selectRecentlyEnactedBills(env.DB, congress, limit);
  if (laws.length === 0) {
    return { congress, session, laws, as_of: asOf };
  }

  const executiveSince = lookbackStartIso(EXECUTIVE_SIGNAL_LOOKBACK_DAYS);
  const items = await buildFeedItemsForBills(env, feedBillRowsForLaws(laws), {
    now: asOf,
    executiveSince,
  });

  return {
    congress,
    session,
    laws: laws.map((law, index) => ({
      ...law,
      item: items[index] ?? null,
    })),
    as_of: asOf,
  };
}

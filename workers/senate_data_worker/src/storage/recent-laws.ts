import { selectRecentlyEnactedBills } from "../d1/lifecycle";
import type { RecentLawItem, RecentLawsResponse } from "../../../../shared/laws-api-types";

export type { RecentLawItem, RecentLawsResponse };

export async function buildRecentLaws(
  db: D1Database,
  congress: number,
  session: number,
  limit: number,
  asOf: string = new Date().toISOString()
): Promise<RecentLawsResponse> {
  const rows = await selectRecentlyEnactedBills(db, congress, limit);
  const laws: RecentLawItem[] = rows.map((row) => ({
    congress: row.congress,
    bill_type: row.bill_type,
    bill_number: row.bill_number,
    title: row.title,
    policy_area: row.policy_area,
    headline: row.headline,
    became_law_date: row.became_law_date,
    law_kind: row.law_kind,
    public_law: row.public_law,
    signed_date: row.signed_date,
    presented_date: row.presented_date,
    latest_action_date: row.latest_action_date,
    latest_action_text: row.latest_action_text,
  }));
  return { congress, session, laws, as_of: asOf };
}

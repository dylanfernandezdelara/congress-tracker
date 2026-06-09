import { FEED_MAX_BILLS, VOTE_LOOKBACK_DAYS } from "../constants";
import type { Env } from "../config";
import { getDigest } from "../d1/digests";
import { ensureSchema } from "../d1/schema";
import { getPassageVotesForBill, selectRecentVotedBills } from "../d1/votes";
import { lookbackStartIso } from "../sources/congress-client";
import type { BillDigestContent, Chamber, FeedItem } from "../types";

function parseDigest(json: string | null): BillDigestContent | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as BillDigestContent;
  } catch {
    return null;
  }
}

export async function buildFeed(env: Env): Promise<FeedItem[]> {
  await ensureSchema(env.DB);
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const bills = await selectRecentVotedBills(env.DB, lookback, FEED_MAX_BILLS);
  const items: FeedItem[] = [];

  for (const row of bills) {
    const digestRow = await getDigest(
      env.DB,
      row.bill_congress,
      row.bill_type,
      row.bill_number
    );
    const votes = await getPassageVotesForBill(
      env.DB,
      row.bill_congress,
      row.bill_type,
      row.bill_number
    );

    items.push({
      bill: {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
        title: digestRow?.title ?? null,
      },
      policy_area: digestRow?.policy_area ?? null,
      digest: parseDigest(digestRow?.digest_json ?? null),
      raw_summary_text: digestRow?.raw_summary_text ?? null,
      passage_votes: votes.map((v) => ({
        chamber: v.chamber as Chamber,
        question: v.question,
        result: v.result,
        yeas: v.yeas,
        nays: v.nays,
        date: v.vote_date,
      })),
      latest_passage_date: row.latest_passage_date,
    });
  }

  return items;
}

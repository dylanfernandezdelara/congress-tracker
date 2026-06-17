import { FEED_MAX_BILLS, VOTE_LOOKBACK_DAYS } from "../constants";
import type { Env } from "../config";
import { getDigest } from "../d1/digests";
import { ensureSchema } from "../d1/schema";
import {
  countRecentVotedBills,
  getPassageVotesForBill,
  selectRecentVotedBills,
} from "../d1/votes";
import { lookbackStartIso } from "../sources/congress-client";
import type { BillDigestContent, Chamber, FeedItem, FeedPageResponse } from "../types";

export interface FeedPageOptions {
  limit: number;
  offset: number;
}

function parseDigest(json: string | null): BillDigestContent | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as BillDigestContent;
  } catch {
    return null;
  }
}

export async function buildFeedPage(
  env: Env,
  options: FeedPageOptions
): Promise<FeedPageResponse> {
  await ensureSchema(env.DB);
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const cappedLimit = Math.min(options.limit, FEED_MAX_BILLS);
  const offset = Math.max(0, options.offset);
  const [total, bills] = await Promise.all([
    countRecentVotedBills(env.DB, lookback),
    selectRecentVotedBills(env.DB, lookback, cappedLimit, offset),
  ]);
  const cappedTotal = Math.min(total, FEED_MAX_BILLS);
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

  return {
    items,
    total: cappedTotal,
    limit: cappedLimit,
    offset,
    has_more: offset + items.length < cappedTotal,
  };
}

/** @deprecated Prefer buildFeedPage; kept for callers that need the full feed slice. */
export async function buildFeed(env: Env): Promise<FeedItem[]> {
  const page = await buildFeedPage(env, { limit: FEED_MAX_BILLS, offset: 0 });
  return page.items;
}

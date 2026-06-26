import { EXECUTIVE_SIGNAL_LOOKBACK_DAYS, FEED_MAX_BILLS, VOTE_LOOKBACK_DAYS } from "../constants";
import type { Env } from "../config";
import { getExecutivePostBillsForBill, getExecutivePostBillsForPost, toExecutiveSignal } from "../d1/executive";
import { getDigest, parseStoredDigest } from "../d1/digests";
import { ensureSchema } from "../d1/schema";
import {
  countFeedBills,
  getPassageVotesForBill,
  selectFeedBills,
} from "../d1/votes";
import { lookbackStartIso } from "../sources/congress-client";
import type { RelatedExecutiveBill } from "../../../../shared/executive-api-types";
import type { ExecutiveBillRole } from "../../../../shared/executive-api-types";
import type { Chamber, FeedItem, FeedPageResponse } from "../types";

export interface FeedPageOptions {
  limit: number;
  offset: number;
}

export async function buildFeedPage(
  env: Env,
  options: FeedPageOptions
): Promise<FeedPageResponse> {
  await ensureSchema(env.DB);
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const executiveSince = lookbackStartIso(EXECUTIVE_SIGNAL_LOOKBACK_DAYS);
  const cappedLimit = Math.min(options.limit, FEED_MAX_BILLS);
  const offset = Math.max(0, options.offset);
  const [total, bills] = await Promise.all([
    countFeedBills(env.DB, lookback, executiveSince),
    selectFeedBills(env.DB, lookback, executiveSince, cappedLimit, offset),
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
    const executivePosts = await getExecutivePostBillsForBill(
      env.DB,
      row.bill_congress,
      row.bill_type,
      row.bill_number,
      executiveSince
    );
    const executive_signals = executivePosts
      .filter((post) => post.summary && post.role === "primary")
      .map((post) => ({
        ...toExecutiveSignal(post),
        role: post.role as ExecutiveBillRole,
        rationale: post.rationale ?? undefined,
      }));

    const related_executive_bills: RelatedExecutiveBill[] = [];
    const relatedKeys = new Set<string>();
    for (const signal of executive_signals) {
      const links = await getExecutivePostBillsForPost(env.DB, signal.post_id);
      for (const link of links) {
        if (
          link.bill_congress === row.bill_congress &&
          link.bill_type.toUpperCase() === row.bill_type.toUpperCase() &&
          link.bill_number === row.bill_number
        ) {
          continue;
        }
        const relatedKey = `${link.bill_congress}:${link.bill_type.toUpperCase()}:${link.bill_number}`;
        if (relatedKeys.has(relatedKey)) continue;
        relatedKeys.add(relatedKey);
        const otherDigest = await getDigest(
          env.DB,
          link.bill_congress,
          link.bill_type,
          link.bill_number
        );
        const otherParsed = parseStoredDigest(otherDigest?.digest_json ?? null);
        related_executive_bills.push({
          congress: link.bill_congress,
          type: link.bill_type,
          number: link.bill_number,
          title: otherDigest?.title ?? null,
          headline: otherParsed?.headline ?? null,
          role: link.role as RelatedExecutiveBill["role"],
          reason: link.rationale ?? "mentioned_in_same_post",
        });
      }
    }

    items.push({
      bill: {
        congress: row.bill_congress,
        type: row.bill_type,
        number: row.bill_number,
        title: digestRow?.title ?? null,
      },
      policy_area: digestRow?.policy_area ?? null,
      digest: parseStoredDigest(digestRow?.digest_json ?? null),
      raw_summary_text: digestRow?.raw_summary_text ?? null,
      passage_votes: votes.map((v) => ({
        chamber: v.chamber as Chamber,
        congress: v.congress,
        session: v.session,
        roll_number: v.roll_number,
        question: v.question,
        result: v.result,
        yeas: v.yeas,
        nays: v.nays,
        date: v.vote_date,
      })),
      latest_passage_date: row.latest_passage_date,
      executive_signals,
      related_executive_bills,
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

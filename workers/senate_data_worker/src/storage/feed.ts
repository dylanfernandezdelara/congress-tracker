import { EXECUTIVE_SIGNAL_LOOKBACK_DAYS, FEED_MAX_BILLS, VOTE_LOOKBACK_DAYS } from "../constants";
import type { Env } from "../config";
import {
  executiveBillMapKey,
  getExecutivePostBillsForBills,
  getExecutivePostBillsForPosts,
  toExecutiveSignal,
} from "../d1/executive";
import { digestMapKey, getDigestsForBills, parseStoredDigest } from "../d1/digests";
import {
  getLifecyclesForBills,
  lifecycleMapKey,
} from "../d1/lifecycle";
import { ensureSchema } from "../d1/schema";
import {
  billLookupKey,
  countFeedBills,
  getPassageVotesForBills,
  selectFeedBills,
} from "../d1/votes";
import { lifecycleRowToApi } from "../lifecycle/to-api";
import { lookbackStartIso } from "../sources/congress-client";
import type { RelatedExecutiveBill } from "../../../../shared/executive-api-types";
import type { ExecutiveBillRole } from "../../../../shared/executive-api-types";
import type { Chamber, FeedItem, FeedPageResponse } from "../types";

export interface FeedPageOptions {
  limit: number;
  offset: number;
  /** When set, only bills with a passage vote in this chamber. */
  chamber?: Chamber;
  /** Injectable clock for ten-day derivation tests. */
  now?: Date | string;
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
  const chamber = options.chamber;
  const now = options.now ?? new Date();
  const [total, bills] = await Promise.all([
    countFeedBills(env.DB, lookback, executiveSince, chamber),
    selectFeedBills(env.DB, lookback, executiveSince, cappedLimit, offset, chamber),
  ]);
  const cappedTotal = Math.min(total, FEED_MAX_BILLS);

  const billKeys = bills.map((row) => ({
    congress: row.bill_congress,
    billType: row.bill_type,
    billNumber: row.bill_number,
  }));

  const [lifecycles, digests, votesByBill, executiveByBill] = await Promise.all([
    getLifecyclesForBills(env.DB, billKeys),
    getDigestsForBills(
      env.DB,
      billKeys.map((bill) => ({
        congress: bill.congress,
        billType: bill.billType,
        number: bill.billNumber,
      }))
    ),
    getPassageVotesForBills(env.DB, billKeys),
    getExecutivePostBillsForBills(env.DB, billKeys, executiveSince),
  ]);

  const postIds = new Set<string>();
  for (const posts of executiveByBill.values()) {
    for (const post of posts) {
      if (post.summary) postIds.add(post.id);
    }
  }
  const linksByPost = await getExecutivePostBillsForPosts(env.DB, [...postIds]);

  const relatedBillKeys: Array<{ congress: number; billType: string; number: number }> = [];
  const relatedKeySet = new Set<string>();
  for (const [billKey, posts] of executiveByBill) {
    for (const post of posts) {
      if (!post.summary) continue;
      for (const link of linksByPost.get(post.id) ?? []) {
        const relatedKey = executiveBillMapKey(
          link.bill_congress,
          link.bill_type,
          link.bill_number
        );
        if (relatedKey === billKey || relatedKeySet.has(relatedKey)) continue;
        relatedKeySet.add(relatedKey);
        relatedBillKeys.push({
          congress: link.bill_congress,
          billType: link.bill_type,
          number: link.bill_number,
        });
      }
    }
  }

  const missingRelated = relatedBillKeys.filter(
    (bill) => !digests.has(digestMapKey(bill.congress, bill.billType, bill.number))
  );
  const relatedDigests =
    missingRelated.length > 0 ? await getDigestsForBills(env.DB, missingRelated) : new Map();
  for (const [key, row] of relatedDigests) {
    digests.set(key, row);
  }

  const items: FeedItem[] = [];

  for (const row of bills) {
    const key = billLookupKey(row.bill_congress, row.bill_type, row.bill_number);
    const digestRow = digests.get(key) ?? null;
    const votes = votesByBill.get(key) ?? [];
    const executivePosts = executiveByBill.get(key) ?? [];
    const executive_signals = executivePosts
      .filter((post) => post.summary)
      .map((post) => ({
        ...toExecutiveSignal(post),
        role: post.role as ExecutiveBillRole,
        rationale: post.rationale ?? undefined,
      }));

    const related_executive_bills: RelatedExecutiveBill[] = [];
    const relatedKeys = new Set<string>();
    for (const signal of executive_signals) {
      const links = linksByPost.get(signal.post_id) ?? [];
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
        const otherDigest =
          digests.get(
            digestMapKey(link.bill_congress, link.bill_type, link.bill_number)
          ) ?? null;
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

    const lifecycleRow = lifecycles.get(
      lifecycleMapKey(row.bill_congress, row.bill_type, row.bill_number)
    );

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
      lifecycle: lifecycleRow ? lifecycleRowToApi(lifecycleRow, now) : null,
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

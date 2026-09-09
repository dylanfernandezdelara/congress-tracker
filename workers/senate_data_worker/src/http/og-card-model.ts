import {
  assembleOgCardModel,
  buildStatusLine,
  formatCardDate,
  type OgCardModel,
  type OgCardTally,
} from "../../../../shared/og-card";
import { quoteBelongsToBill } from "../../../../shared/quote-verification";
import { parseShareDigestJson } from "../../../../shared/share-copy";
import type { BillQuote } from "../../../../shared/share-api-types";
import { computeRollDefectors } from "../analytics/defectors";
import type { Env } from "../config";
import { getBillQuote } from "../d1/bill-quotes";
import { getDigest, type DigestRow } from "../d1/digests";
import { getLifecycle } from "../d1/lifecycle";
import { getPassageVotesForBill } from "../d1/votes";

export type OgCardBillRef = { congress: number; type: string; number: number };

export { buildStatusLine, formatCardDate };

export type LoadOgCardModelResult =
  | { ok: true; model: OgCardModel }
  | { ok: false; reason: "bill_not_found" | "quote_not_found" };

/**
 * Assemble the share-card model from D1: digest headline, optional stored
 * quote (must belong to the bill), newest passage vote + party splits.
 */
export async function loadOgCardModel(
  env: Env,
  bill: OgCardBillRef,
  quoteId: string | null,
  preloaded: { digestRow?: DigestRow | null; quote?: BillQuote | null } = {}
): Promise<LoadOgCardModelResult> {
  const digestRow =
    preloaded.digestRow !== undefined
      ? preloaded.digestRow
      : await getDigest(env.DB, bill.congress, bill.type, bill.number);
  if (!digestRow) return { ok: false, reason: "bill_not_found" };

  let quote: string | null = null;
  if (quoteId) {
    const stored =
      preloaded.quote !== undefined ? preloaded.quote : await getBillQuote(env.DB, quoteId);
    if (!stored || !quoteBelongsToBill(stored, bill)) {
      return { ok: false, reason: "quote_not_found" };
    }
    quote = stored.text;
  }

  const [votes, lifecycle] = await Promise.all([
    getPassageVotesForBill(env.DB, bill.congress, bill.type, bill.number),
    getLifecycle(env.DB, bill.congress, bill.type, bill.number),
  ]);
  const latestVote = votes[0] ?? null;

  let partySplits: OgCardTally["party_splits"] = [];
  if (latestVote) {
    try {
      const defectors = await computeRollDefectors(env.DB, {
        chamber: latestVote.chamber === "Senate" ? "Senate" : "House",
        congress: latestVote.congress,
        session: latestVote.session,
        roll_number: latestVote.roll_number,
      });
      partySplits = defectors.party_splits;
    } catch (err: unknown) {
      console.warn("og_card_party_splits_unavailable", err);
    }
  }

  return {
    ok: true,
    model: assembleOgCardModel({
      bill,
      digestHeadline: parseShareDigestJson(digestRow.digest_json).headline,
      officialTitle: digestRow.title,
      quote,
      latestVote,
      partySplits,
      becameLawDate: lifecycle?.became_law_date,
      vetoedDate: lifecycle?.vetoed_date,
    }),
  };
}

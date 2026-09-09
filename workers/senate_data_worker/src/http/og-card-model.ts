import { trimDisplayTitle } from "../../../../shared/bill-id";
import {
  OG_CARD_HEADLINE_MAX_CHARS,
  OG_CARD_QUOTE_MAX_CHARS,
  buildStatusLine,
  formatCardDate,
  ogCardDocket,
  truncateForCard,
  type OgCardModel,
  type OgCardTally,
} from "../../../../shared/og-card";
import { parseShareDigestJson } from "../../../../shared/share-copy";
import { proceduralHeadline } from "../../../../shared/procedural-titles";
import { computeRollDefectors } from "../analytics/defectors";
import type { Env } from "../config";
import type { BillQuote } from "../../../../shared/share-api-types";
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
    if (
      !stored ||
      stored.bill.congress !== bill.congress ||
      stored.bill.type !== bill.type.toUpperCase() ||
      stored.bill.number !== bill.number
    ) {
      return { ok: false, reason: "quote_not_found" };
    }
    quote = truncateForCard(stored.text, OG_CARD_QUOTE_MAX_CHARS);
  }

  const parsed = parseShareDigestJson(digestRow.digest_json);
  const officialTitle = digestRow.title?.trim() || null;
  const headlineSource =
    parsed.headline ||
    (officialTitle ? proceduralHeadline(officialTitle) || trimDisplayTitle(officialTitle) : null) ||
    ogCardDocket(bill);

  const [votes, lifecycle] = await Promise.all([
    getPassageVotesForBill(env.DB, bill.congress, bill.type, bill.number),
    getLifecycle(env.DB, bill.congress, bill.type, bill.number),
  ]);
  const latestVote = votes[0] ?? null;

  let tally: OgCardTally | null = null;
  if (latestVote) {
    const chamber = latestVote.chamber === "Senate" ? "Senate" : "House";
    let partySplits: OgCardTally["party_splits"] = [];
    try {
      const defectors = await computeRollDefectors(env.DB, {
        chamber,
        congress: latestVote.congress,
        session: latestVote.session,
        roll_number: latestVote.roll_number,
      });
      partySplits = defectors.party_splits;
    } catch (err: unknown) {
      console.warn("og_card_party_splits_unavailable", err);
    }
    tally = { chamber, yeas: latestVote.yeas, nays: latestVote.nays, party_splits: partySplits };
  }

  return {
    ok: true,
    model: {
      docket: ogCardDocket(bill),
      headline: truncateForCard(headlineSource, OG_CARD_HEADLINE_MAX_CHARS),
      quote,
      status_line: buildStatusLine({
        latestVote,
        becameLawDate: lifecycle?.became_law_date ?? null,
        vetoedDate: lifecycle?.vetoed_date ?? null,
      }),
      tally,
    },
  };
}

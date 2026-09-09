import { trimDisplayTitle } from '@congress-tracker/shared/bill-id'
import {
  OG_CARD_HEADLINE_MAX_CHARS,
  OG_CARD_QUOTE_MAX_CHARS,
  buildStatusLine,
  ogCardDocket,
  truncateForCard,
  type OgCardModel,
  type OgCardTally,
} from '@congress-tracker/shared/og-card'
import { proceduralHeadline } from '@congress-tracker/shared/procedural-titles'
import type { RollPartySplit } from '@congress-tracker/shared/stats-api-types'

import type { FeedItem, FeedPassageVote } from '../api/types'

/** Newest passage vote by date (the feed does not guarantee ordering). */
export function latestPassageVote(votes: FeedPassageVote[]): FeedPassageVote | null {
  let latest: FeedPassageVote | null = null
  for (const vote of votes) {
    if (!latest || vote.date > latest.date) latest = vote
  }
  return latest
}

/**
 * Client twin of the worker's `loadOgCardModel`: same headline/status/tally
 * rules from feed data the detail panel already holds, so the share sheet
 * preview matches the PNG crawlers fetch.
 */
export function buildOgCardModelFromFeedItem(
  item: Pick<FeedItem, 'bill' | 'digest' | 'passage_votes' | 'lifecycle'>,
  options: { quote?: string | null; partySplits?: RollPartySplit[] } = {},
): OgCardModel {
  const officialTitle = item.bill.title?.trim() || null
  const digestHeadline = item.digest?.headline?.trim()
  const headlineSource =
    (digestHeadline ? trimDisplayTitle(digestHeadline) : null) ||
    (officialTitle ? proceduralHeadline(officialTitle) || trimDisplayTitle(officialTitle) : null) ||
    ogCardDocket(item.bill)
  const vote = latestPassageVote(item.passage_votes)
  const tally: OgCardTally | null = vote
    ? {
        chamber: vote.chamber === 'Senate' ? 'Senate' : 'House',
        yeas: vote.yeas,
        nays: vote.nays,
        party_splits: options.partySplits ?? [],
      }
    : null
  return {
    docket: ogCardDocket(item.bill),
    headline: truncateForCard(headlineSource, OG_CARD_HEADLINE_MAX_CHARS),
    quote: options.quote ? truncateForCard(options.quote, OG_CARD_QUOTE_MAX_CHARS) : null,
    status_line: buildStatusLine({
      latestVote: vote
        ? {
            chamber: vote.chamber,
            yeas: vote.yeas,
            nays: vote.nays,
            result: vote.result,
            vote_date: vote.date,
          }
        : null,
      becameLawDate: item.lifecycle?.became_law_date ?? null,
      vetoedDate: item.lifecycle?.vetoed_date ?? null,
    }),
    tally,
  }
}

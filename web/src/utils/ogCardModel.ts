import { assembleOgCardModel, type OgCardModel } from '@congress-tracker/shared/og-card'
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
 * Client twin of the worker's `loadOgCardModel`: feeds the shared assembler
 * from feed data the detail panel already holds, so the share sheet preview
 * matches the PNG crawlers fetch.
 */
export function buildOgCardModelFromFeedItem(
  item: Pick<FeedItem, 'bill' | 'digest' | 'passage_votes' | 'lifecycle'>,
  options: { quote?: string | null; partySplits?: RollPartySplit[] } = {},
): OgCardModel {
  const vote = latestPassageVote(item.passage_votes)
  return assembleOgCardModel({
    bill: item.bill,
    digestHeadline: item.digest?.headline,
    officialTitle: item.bill.title,
    quote: options.quote,
    latestVote: vote
      ? { chamber: vote.chamber, yeas: vote.yeas, nays: vote.nays, result: vote.result, vote_date: vote.date }
      : null,
    partySplits: options.partySplits ?? [],
    becameLawDate: item.lifecycle?.became_law_date,
    vetoedDate: item.lifecycle?.vetoed_date,
  })
}

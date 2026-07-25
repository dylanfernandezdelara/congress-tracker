/**
 * Barrel for feed/digest/bill/vote display helpers.
 * Prefer importing from the focused modules (`digest-format`, `bill-id`,
 * `procedural-titles`, `vote-result`) when adding new call sites.
 */
export {
  DIGEST_BULLET_MAX_WORDS,
  DIGEST_LEAD_MAX_WORDS,
  DIGEST_MAX_BULLETS,
  FEED_BULLET_MAX_WORDS,
  FEED_COLLAPSED_MAX_BULLETS,
  FEED_LEAD_MAX_WORDS,
  buildFeedSummaryParts,
  formatCollapsedDigestBullets,
  formatCollapsedDigestLead,
  normalizeDigestBullets,
  normalizeDigestLead,
  truncateAtSentenceBoundary,
  truncateAtWordBoundary,
} from './digest-format'

export {
  congressGovBillUrl,
  congressOrdinal,
  formatBillDocket,
  formatBillIdParts,
  formatShortBillId,
  stripLocalSampleLabel,
  trimDisplayTitle,
} from './bill-id'

export {
  extractUnderlyingBillIdFromTitle,
  isProceduralVote,
  proceduralHeadline,
} from './procedural-titles'

export { formatFallbackHeadline } from './fallback-headline'

export { voteIndicatesFailure } from './vote-result'

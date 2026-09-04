/** Shared feed tuning constants — consumed by worker and web. */

/** Passage-vote lookback window for the action-row feed (days). */
export const VOTE_LOOKBACK_DAYS = 45

/**
 * Introduction lookback for feed membership (days). Intro-only bills stay
 * visible this long after `introduced_date`, even with zero passage votes.
 */
export const INTRO_LOOKBACK_DAYS = 7

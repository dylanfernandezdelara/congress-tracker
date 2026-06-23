/** Feed and pipeline tuning (module constants, not env). */
export const FEED_MAX_BILLS = 50;
export const FEED_DEFAULT_PAGE_SIZE = 50;
export const FEED_MAX_PAGE_SIZE = 50;
export const VOTE_LOOKBACK_DAYS = 45;
export const DIGEST_MAX_NEW_REWRITES = 20;
export const DIGEST_REFRESH_MAX_BILLS = 25;
export const GAME_DEFAULT_LIMIT = 20;
export const GAME_MAX_LIMIT = 50;
export const GAME_POOL_SIZE = 200;

/**
 * Roll-call votes to backfill per /__pipeline/run/member-votes invocation.
 * Each roll costs one upstream fetch plus a couple of batched D1 writes, so we
 * cap per run to stay under the Worker subrequest limit (1000) and let the
 * pipeline be re-invoked until `rollsRemaining` reaches 0.
 */
export const MEMBER_VOTES_MAX_ROLLS_PER_RUN = 150;

/**
 * New passage votes to ingest per /__pipeline/run/session-backfill invocation.
 * House backfill fetches one detail URL per new roll; cap per run to stay under
 * the Worker subrequest limit and re-invoke until `votesRemaining` is 0.
 */
export const SESSION_BACKFILL_MAX_NEW_VOTES = 200;

export const USER_AGENT = "congress-tracker/0.1";

/** Must stay aligned with `[triggers].crons` in wrangler.toml. */
export const FEED_PIPELINE_CRON_UTC = "0 10 * * *";

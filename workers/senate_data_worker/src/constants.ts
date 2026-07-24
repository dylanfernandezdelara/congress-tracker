/** Feed and pipeline tuning (module constants, not env). */
export const FEED_MAX_BILLS = 50;
export const FEED_DEFAULT_PAGE_SIZE = 50;
export const FEED_MAX_PAGE_SIZE = 50;
export const VOTE_LOOKBACK_DAYS = 45;
/** Bills with executive signals stay feed-visible for this many days. */
export const EXECUTIVE_SIGNAL_LOOKBACK_DAYS = 14;
/** Homepage statuses fetched per executive ingest run. */
export const EXECUTIVE_POSTS_FETCH_LIMIT = 15;
/** Minimum LLM confidence to auto-link a bill. */
export const EXECUTIVE_LINK_MIN_CONFIDENCE = 0.75;
export const DIGEST_MAX_NEW_REWRITES = 20;
export const DIGEST_REFRESH_MAX_BILLS = 25;
/**
 * Congress.gov lifecycle refreshes (actions + detail) per feed pipeline run.
 * Must cover the full feed window so older desk/unsigned bills are not starved
 * by newer non-terminal passage votes that re-consume the budget every run.
 */
export const LIFECYCLE_MAX_REFRESHES_PER_RUN = FEED_MAX_BILLS;

/**
 * Roll-call votes to backfill per /__pipeline/run/member-votes invocation.
 * Each roll costs one upstream fetch plus a couple of batched D1 writes, so we
 * cap per run to stay under the Worker subrequest limit (1000) and let the
 * pipeline be re-invoked until `rollsRemaining` reaches 0.
 */
export const MEMBER_VOTES_MAX_ROLLS_PER_RUN = 150;

/** Minimum seated members to treat a chamber roster as complete (real Congress data). */
export const HOUSE_ROSTER_MIN = 400;
export const SENATE_ROSTER_MIN = 95;

/**
 * New passage votes to ingest per /__pipeline/run/session-backfill invocation.
 * House backfill fetches one detail URL per new roll; cap per run to stay under
 * the Worker subrequest limit and re-invoke until `votesRemaining` is 0.
 */
export const SESSION_BACKFILL_MAX_NEW_VOTES = 200;

export const USER_AGENT = "congress-tracker/0.1";

/** Daily feed ingest cron (UTC). Must match `[triggers].crons` in wrangler.toml. */
export const FEED_PIPELINE_CRON_UTC = "0 10 * * *";

/** Executive Truth Social ingest cron (UTC). Must match `[triggers].crons` in wrangler.toml. */
export const EXECUTIVE_POSTS_CRON_UTC = "0 * * * *";

/** Alert if no successful scheduled ingest within this many hours after cron. */
export const FEED_PIPELINE_STALE_HOURS = 26;

/** Alert if no successful scheduled executive ingest within this many hours. */
export const EXECUTIVE_PIPELINE_STALE_HOURS = 2;

/** D1 lease TTL so a crashed pipeline cannot block writes forever. */
export const PIPELINE_LEASE_TTL_MS = 10 * 60 * 1000;

/** Single global write lease shared by all mutating pipelines. */
export const PIPELINE_WRITE_LEASE_NAME = "writes";

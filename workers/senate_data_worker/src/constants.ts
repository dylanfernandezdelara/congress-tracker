/** Feed and pipeline tuning (module constants, not env). */
export { VOTE_LOOKBACK_DAYS } from "../../../shared/feed-constants";
export {
  TEXT_CHANGES_MAX_LISTED_PROVISIONS,
  TEXT_CHANGES_MAX_STORED_PROVISIONS,
} from "../../../shared/bill-text-constants";

export const FEED_MAX_BILLS = 50;
export const FEED_DEFAULT_PAGE_SIZE = 50;
export const FEED_MAX_PAGE_SIZE = 50;
/** Max accepted length for feed `q` search (silently truncated). */
export const FEED_SEARCH_MAX_LENGTH = 100;
/** Bills with executive signals stay feed-visible for this many days. */
export const EXECUTIVE_SIGNAL_LOOKBACK_DAYS = 14;
/** Homepage statuses fetched per executive ingest run. */
export const EXECUTIVE_POSTS_FETCH_LIMIT = 15;
/** Minimum LLM confidence to auto-link a bill. */
export const EXECUTIVE_LINK_MIN_CONFIDENCE = 0.75;
export const DIGEST_MAX_NEW_REWRITES = 20;
export const DIGEST_REFRESH_MAX_BILLS = 25;

/**
 * Bill text-version comparisons per feed pipeline run. Each candidate costs two
 * small JSON requests; only bills whose newest text version changed since the
 * last check download XML, so the steady-state cost is the JSON probes alone.
 */
export const TEXT_CHANGES_MAX_REFRESHES_PER_RUN = FEED_MAX_BILLS;
/** Skip text diffing above this document size to bound cron memory and time. */
export const BILL_TEXT_MAX_BYTES = 8 * 1024 * 1024;
/** Newest companion (non-passage) rolls carried per bill in the feed payload. */
export const COMPANION_VOTES_PER_BILL = 6;

/**
 * House roll-call detail fetches per ingest run. Every roll missing from the
 * known-key set costs one request, so an unfetched backlog — such as the
 * non-passage stubs written before companion votes were stored — must not be
 * able to exhaust the Worker subrequest limit (1000) in a single run. Rolls
 * beyond the cap stay unknown and are picked up by the next run.
 */
export const HOUSE_VOTE_DETAIL_FETCHES_PER_RUN = 200;

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

/**
 * Max rolls to repair per member-session-stats reconcile invocation when drift
 * is detected. Remaining drifted rolls are reported so the next run continues.
 */
export const MEMBER_SESSION_STATS_MAX_ROLLS_PER_RECONCILE = 25;

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

/**
 * Executive Truth Social ingest cron (UTC). Must match `[triggers].crons` in wrangler.toml.
 * Off :00 so it never shares a minute with FEED_PIPELINE_CRON_UTC — both use one write lease;
 * a collision silently skips the daily feed ingest.
 */
export const EXECUTIVE_POSTS_CRON_UTC = "20 * * * *";

/** Alert if no successful scheduled ingest within this many hours after cron. */
export const FEED_PIPELINE_STALE_HOURS = 26;

/** Alert if no successful scheduled executive ingest within this many hours. */
export const EXECUTIVE_PIPELINE_STALE_HOURS = 2;

/**
 * D1 lease TTL so a crashed pipeline cannot block writes forever. Must outlast
 * the longest run by more than the gap between FEED_PIPELINE_CRON_UTC and the
 * next EXECUTIVE_POSTS_CRON_UTC firing: if it expires mid-run, the hourly cron
 * acquires the lease and writes alongside a daily ingest that is still going.
 */
export const PIPELINE_LEASE_TTL_MS = 30 * 60 * 1000;

/** Single global write lease shared by all mutating pipelines. */
export const PIPELINE_WRITE_LEASE_NAME = "writes";

/** Feed and pipeline tuning (module constants, not env). */
export { INTRO_LOOKBACK_DAYS, VOTE_LOOKBACK_DAYS } from "../../../shared/feed-constants";
export {
  TEXT_CHANGES_MAX_LISTED_PROVISIONS,
  TEXT_CHANGES_MAX_STORED_PROVISIONS,
} from "../../../shared/bill-text-constants";

export const FEED_MAX_BILLS = 50;
export const FEED_DEFAULT_PAGE_SIZE = 50;
export const FEED_MAX_PAGE_SIZE = 50;
/** Max accepted length for feed `q` search (silently truncated). */
export const FEED_SEARCH_MAX_LENGTH = 100;
/** Default / max rows for `GET /stats/members.json` autocomplete. */
export const MEMBER_SEARCH_DEFAULT_LIMIT = 8;
export const MEMBER_SEARCH_MAX_LIMIT = 20;
/** Bills with executive signals stay feed-visible for this many days. */
export const EXECUTIVE_SIGNAL_LOOKBACK_DAYS = 14;
/**
 * Shared intro cap after hard-filter + soft-rank: persist and the intro UNION
 * LIMIT (both chambers). Persist and the read-path UNION both rank by soft
 * score, then introduced date, then number. Soft score does not drop under-cap
 * survivors.
 */
export const INTRO_FEED_MAX_NEW = 12;
/** Congress.gov bill-list page size for intro discovery (`/v3/bill/{congress}/{type}`). */
export const INTRO_DISCOVERY_PAGE_SIZE = 250;
/** List pages per bill type (hr, s) per run. fromDateTime already limits to the lookback. */
export const INTRO_DISCOVERY_MAX_PAGES_PER_TYPE = 2;
/**
 * Extra bill-detail fetches per intro run (same `/v3/bill/{congress}/{type}/{number}`).
 * Spend order: undated intro-phrase, undated same-day referral, then dated rows
 * missing policyArea or primary sponsor (so Private Legislation can fail closed).
 * Soft score still fails open when those fields stay missing.
 */
export const INTRO_DETAIL_FETCHES_PER_RUN = 25;
/** Homepage statuses fetched per executive ingest run. */
export const EXECUTIVE_POSTS_FETCH_LIMIT = 15;
/** Minimum LLM confidence to auto-link a bill. */
export const EXECUTIVE_LINK_MIN_CONFIDENCE = 0.75;
export const DIGEST_REFRESH_MAX_BILLS = 25;
/**
 * Plain-language summaries (pipeline/run-summary-sweep.ts, hourly). Bills that matter are rewritten directly, a
 * few per run; everything else goes to one Luna batch per run. Spend is also capped per day (DIGEST_DAILY_BUDGET_USD).
 */
export const DIGEST_REWRITES_PER_RUN = 5;
export const DIGEST_BATCH_BILLS_PER_RUN = 40;
/** Queued jobs looked at per run, per queue: unchanged bills are skipped without counting against the caps above. */
export const DIGEST_REWRITE_SCAN_PER_RUN = 15;
export const DIGEST_BATCH_SCAN_PER_RUN = 80;
/** A batch stops taking bills at about this many input tokens (a few giant bills can fill it). */
export const DIGEST_BATCH_MAX_TOKENS = 1_500_000;
/** Bills collected from finished batches per run; the rest wait in the open batch for the next run. */
export const DIGEST_COLLECT_BILLS_PER_RUN = 40;
/**
 * Synchronous (normal API) writes per run, across rewrites, collect fallbacks and direct writes, and the wall time
 * after which no new one starts. Cron invocations end at 15 minutes; a write cut off there is still counted.
 */
export const DIGEST_SYNC_WRITES_PER_RUN = 8;
export const DIGEST_SWEEP_WRITE_WINDOW_MS = 10 * 60_000;
/** No new bill of any kind is started after this; with a write in flight the run still ends inside 15 minutes. */
export const DIGEST_SWEEP_RUN_WINDOW_MS = 11 * 60_000;
/**
 * The sweep's write lease: longer than any invocation can live (15 minutes), so a run killed at the limit frees the
 * lease by :51, well before the 10:00 feed.
 */
export const SUMMARY_SWEEP_LEASE_TTL_MS = 16 * 60_000;
/** Admin `POST /__pipeline/run/summary-sweep` cap per invocation (?limit=, applies to both). */
export const DIGEST_SWEEP_ADMIN_MAX_BILLS = 60;
/**
 * Backfill (pipeline/run-summary-backfill.ts): a page of the Congress's bills is queued only while fewer than this
 * many jobs wait, so new bills never queue behind thousands of old ones.
 */
export const DIGEST_BACKFILL_QUEUE_FLOOR = 60;
/** Share of the daily budget backfill jobs may use; the rest stays for new bills and rewrites. */
export const DIGEST_BACKFILL_BUDGET_SHARE = 0.5;
export const DIGEST_BACKFILL_PAGE_SIZE = 100;
/** Congress.gov update-list pages (250 bills each) read per run. */
export const DIGEST_DISCOVERY_PAGES_PER_RUN = 2;
/** Discovery summarizes bills introduced within this many days, plus changed bills already on the site. */
export const DIGEST_NEW_BILL_DAYS = 30;
/** Bills still waiting on text or a CRS summary are re-checked at most this often. */
export const DIGEST_RECHECK_HOURS = 24;
export const DIGEST_RECHECK_PER_RUN = 20;
/** OpenRouter batches finish within 24 hours; after this a batch is treated as expired. */
export const DIGEST_BATCH_EXPIRE_HOURS = 26;
/** After this many tries for the same inputs a bill is written directly instead of batched again. */
export const DIGEST_BATCH_MAX_ATTEMPTS = 2;
/** After this many failed tries for the same inputs a bill is parked until it changes (no more spend on it). */
export const DIGEST_MAX_ATTEMPTS = 3;
/** Max new nomination background rewrites per feed pipeline run. */
export const CONFIRMATION_BACKGROUND_MAX_NEW_REWRITES = 10;
/** Max nomination metadata fetches (Congress.gov) per feed pipeline run. */
export const CONFIRMATION_NOMINATION_FETCHES_PER_RUN = 15;
/** Max Wikipedia person lookups per feed pipeline run. */
export const CONFIRMATION_WIKIPEDIA_FETCHES_PER_RUN = 15;
/** Max grounded vote-context attempts (article fetch, plus LLM when relevant) per feed pipeline run. */
export const CONFIRMATION_VOTE_CONTEXT_PER_RUN = 10;

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
 * Congress.gov public-law list page size. One page covers a typical congress
 * (~100 public laws); the ingest walks `pagination.next` if a session exceeds it.
 */
export const PUBLIC_LAWS_PAGE_SIZE = 250;

/**
 * Per-bill Congress.gov committee hydrations (committees + actions) per process
 * refresh/backfill run. Each bill costs ~2 subrequests.
 */
export const PROCESS_MAX_HYDRATIONS_PER_RUN = 40;
/** Standing-committee bill-list pages to walk per process-backfill run. */
export const PROCESS_MAX_COMMITTEE_LIST_PAGES_PER_RUN = 8;
/** Refresh Congress.gov committee roster when last fetch is older than this. */
export const PROCESS_ROSTER_REFRESH_DAYS = 7;
/** Stop a process run early when Congress.gov rate-limit remaining falls below this. */
export const PROCESS_RATELIMIT_STOP_REMAINING = 200;
/**
 * Re-queue committee hydrations this many days after the last success so
 * waiting bills do not freeze after the first crawl.
 */
export const PROCESS_REHYDRATE_DAYS = 7;

/**
 * Roll-call votes to backfill per /__pipeline/run/member-votes invocation.
 * Each roll costs one upstream fetch plus a couple of batched D1 writes, so we
 * cap per run to stay under the Worker subrequest limit (1000) and let the
 * pipeline be re-invoked until `rollsRemaining` reaches 0.
 */
export const MEMBER_VOTES_MAX_ROLLS_PER_RUN = 150;

/**
 * Max Senate.gov Browser Rendering fetches per Worker isolate/invocation.
 * Caps catch-up member-votes days when Akamai 403 forces BR for every roll.
 * Menu ingest needs at most one; leave headroom for member rolls.
 */
export const SENATE_BROWSER_FETCHES_MAX_PER_RUN = 40;

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
/**
 * Hourly summary sweep (pipeline/run-summary-sweep.ts). Its own invocation, so it has its own subrequest and
 * wall-time budget. At :35 with a 16-minute lease (SUMMARY_SWEEP_LEASE_TTL_MS), even a sweep killed at the wall limit
 * frees the write lease before the 10:00 feed.
 */
export const SUMMARY_SWEEP_CRON_UTC = "35 * * * *";

/** Alert if no successful scheduled ingest within this many hours after cron. */
export { FEED_PIPELINE_STALE_HOURS } from "../../../shared/ingest-monitor-status";

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

/**
 * Max accepted Senate LIS vote-menu XML body (admin upload). Live menus are
 * ~100–200KB; 2MB leaves headroom without allowing multi-MB DoS payloads.
 */
export const SENATE_VOTE_MENU_MAX_BYTES = 2 * 1024 * 1024;

export {
  SENATE_VOTE_MENU_CACHE_EXPIRY_WARN_MS,
  SENATE_VOTE_MENU_CACHE_MAX_AGE_MS,
  SENATE_VOTE_MENU_CACHE_STALE_MS,
} from "../../../shared/ingest-monitor-status";

/**
 * Pure ingest-monitor evaluation shared by the Worker and ops scripts.
 * Keep Node-20 friendly (plain ESM). Worker/TS imports this module directly.
 */

/** Canonical stale window; Worker re-exports via constants.ts. */
export const FEED_PIPELINE_STALE_HOURS = 26;

/** 7d hard expiry for D1 Senate menu cache fallback. */
export const SENATE_VOTE_MENU_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Daily ops refresh window; older is stale. */
export const SENATE_VOTE_MENU_CACHE_STALE_MS = 48 * 60 * 60 * 1000;

/** Page as failed when within 24h of hard expiry. */
export const SENATE_VOTE_MENU_CACHE_EXPIRY_WARN_MS = 6 * 24 * 60 * 60 * 1000;

export function isIngestMonitorHealthy(status) {
  return status === "ok";
}

export function isIngestMonitorOpsAcceptable(status) {
  return status === "ok" || status === "degraded";
}

export function isChamberHardSkipWarning(warning) {
  return /ingest skipped:/i.test(warning);
}

export function isSenateCacheFallbackWarning(warning) {
  return /served from D1 cache after live fetch failed/i.test(warning);
}

/** House (or Senate) per-run fetch cap; newest rolls still land this run. */
export function isIngestTruncationWarning(warning) {
  return /ingest truncated:/i.test(warning);
}

const DEGRADED_CHAMBER_WARNING = [isSenateCacheFallbackWarning, isIngestTruncationWarning];

function isDegradedChamberWarning(warning) {
  return DEGRADED_CHAMBER_WARNING.some((test) => test(warning));
}

export function classifyChamberWarningSeverity(warnings) {
  if (!warnings || warnings.length === 0) return "none";
  if (warnings.some(isChamberHardSkipWarning)) return "failed";
  if (warnings.every(isDegradedChamberWarning)) return "degraded";
  return "failed";
}

export function resolveScheduledSuccess(dedicated, latest) {
  return dedicated ?? latest;
}

/**
 * Build Senate menu cache monitor fields from a fetched_at ISO timestamp.
 * Returns null when fetched_at is missing/invalid.
 */
export function buildSenateVoteMenuCacheMonitor(fetchedAt, now = new Date()) {
  if (!fetchedAt || typeof fetchedAt !== "string") return null;
  const fetchedMs = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedMs)) return null;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const ageMs = Math.max(0, nowMs - fetchedMs);
  return {
    fetched_at: fetchedAt,
    age_hours: Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10,
    max_age_hours: SENATE_VOTE_MENU_CACHE_MAX_AGE_MS / (60 * 60 * 1000),
    stale: ageMs > SENATE_VOTE_MENU_CACHE_STALE_MS,
    nearing_expiry: ageMs > SENATE_VOTE_MENU_CACHE_EXPIRY_WARN_MS,
    expired: ageMs > SENATE_VOTE_MENU_CACHE_MAX_AGE_MS,
  };
}

/**
 * Evaluate feed (or executive) ingest monitor status.
 * `sanitizeFailureError` optional: (error: string) => string for public messages.
 */
export function evaluateIngestMonitorStatus(params) {
  const sanitize =
    typeof params.sanitizeFailureError === "function"
      ? params.sanitizeFailureError
      : (error) => error;

  const lastScheduledSuccess =
    params.scheduledSuccess?.trigger === "scheduled" ? params.scheduledSuccess : null;
  const lastScheduledFailure =
    params.lastFailure?.trigger === "scheduled" ? params.lastFailure : null;

  if (
    lastScheduledFailure &&
    (!lastScheduledSuccess ||
      Date.parse(lastScheduledFailure.failed_at) >
        Date.parse(lastScheduledSuccess.completed_at))
  ) {
    const publicError = sanitize(lastScheduledFailure.error);
    return {
      status: "failed",
      message: `Last scheduled ingest failed: ${publicError}`,
      last_scheduled_success: lastScheduledSuccess,
    };
  }

  if (!lastScheduledSuccess) {
    return {
      status: "unknown",
      message: "No successful scheduled ingest recorded yet.",
      last_scheduled_success: null,
    };
  }

  const nowMs =
    params.now instanceof Date ? params.now.getTime() : Date.parse(params.now);
  const ageMs = nowMs - Date.parse(lastScheduledSuccess.completed_at);
  const staleAfterMs = params.staleAfterHours * 60 * 60 * 1000;
  if (ageMs > staleAfterMs) {
    return {
      status: "stale",
      message: `Last scheduled ingest was ${lastScheduledSuccess.completed_at}; expected within ${params.staleAfterHours}h of its cron.`,
      last_scheduled_success: lastScheduledSuccess,
    };
  }

  const warnings = params.chamberWarnings ?? [];
  const warningSeverity = classifyChamberWarningSeverity(warnings);
  if (warningSeverity === "failed") {
    return {
      status: "failed",
      message: `Partial chamber ingest: ${warnings.join("; ")}`,
      last_scheduled_success: lastScheduledSuccess,
    };
  }

  const menu = params.senateVoteMenuCache;
  if (menu?.expired || menu?.nearing_expiry) {
    return {
      status: "failed",
      message: menu.expired
        ? `Senate vote menu D1 cache expired (fetched_at ${menu.fetched_at}); refresh before next cron or Senate ingest will hard-skip.`
        : `Senate vote menu D1 cache nearing expiry (age ${menu.age_hours}h / max ${menu.max_age_hours}h); run npm run refresh:senate-menu.`,
      last_scheduled_success: lastScheduledSuccess,
    };
  }

  if (warningSeverity === "degraded") {
    let message = `Partial chamber ingest: ${warnings.join("; ")}`;
    if (menu?.stale) {
      message = `${message} Senate menu cache is stale (${menu.age_hours}h old); refresh daily while Worker→Senate.gov is 403.`;
    }
    return {
      status: "degraded",
      message,
      last_scheduled_success: lastScheduledSuccess,
    };
  }

  if (menu?.stale) {
    return {
      status: "degraded",
      message: `Senate vote menu D1 cache is stale (age ${menu.age_hours}h); refresh with npm run refresh:senate-menu.`,
      last_scheduled_success: lastScheduledSuccess,
    };
  }

  return {
    status: "ok",
    message: "Scheduled ingest completed within the expected window.",
    last_scheduled_success: lastScheduledSuccess,
  };
}

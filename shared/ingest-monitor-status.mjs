/**
 * Ingest monitor status helpers shared by Worker health + ops scripts.
 * Keep semantics aligned with docs/MONITORING.md.
 */

/** True only when scheduled ingest is fully healthy (no chamber fallback). */
export function isIngestMonitorHealthy(status) {
  return status === "ok";
}

/**
 * Acceptable for daily ops automation while Senate.gov 403 keeps Worker
 * ingest in `degraded` (cache fallback). Page on failed/stale/unknown only.
 */
export function isIngestMonitorOpsAcceptable(status) {
  return status === "ok" || status === "degraded";
}

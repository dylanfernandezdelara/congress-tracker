import type { IngestMonitorStatus } from "./ingest-api-types";

/** True only when scheduled ingest is fully healthy (no chamber fallback). */
export function isIngestMonitorHealthy(
  status: IngestMonitorStatus | string | null | undefined
): boolean {
  return status === "ok";
}

/**
 * Acceptable for daily ops automation while Senate.gov 403 keeps Worker
 * ingest in `degraded` (cache fallback). Page on failed/stale/unknown only.
 */
export function isIngestMonitorOpsAcceptable(
  status: IngestMonitorStatus | string | null | undefined
): boolean {
  return status === "ok" || status === "degraded";
}

/** Entire chamber soft-failed inside an otherwise successful feed run. */
export function isChamberHardSkipWarning(warning: string): boolean {
  return /ingest skipped:/i.test(warning);
}

/** Expected Worker→Senate.gov failure served from D1 menu cache. */
export function isSenateCacheFallbackWarning(warning: string): boolean {
  return /served from D1 cache after live fetch failed/i.test(warning);
}

/**
 * Classify chamber_warnings for monitor status when the run would otherwise be ok.
 * Hard skips page as failed; cache-fallback-only stays degraded; unknown shapes page.
 */
export function classifyChamberWarningSeverity(
  warnings: readonly string[]
): "none" | "degraded" | "failed" {
  if (warnings.length === 0) return "none";
  if (warnings.some(isChamberHardSkipWarning)) return "failed";
  if (warnings.every(isSenateCacheFallbackWarning)) return "degraded";
  return "failed";
}

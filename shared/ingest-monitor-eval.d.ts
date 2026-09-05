import type {
  FeedPipelineFailureRecord,
  FeedPipelineTrigger,
  IngestMonitorStatus,
  SenateVoteMenuCacheMonitor,
} from "./ingest-api-types";

export const FEED_PIPELINE_STALE_HOURS: number;
export const SENATE_VOTE_MENU_CACHE_MAX_AGE_MS: number;
export const SENATE_VOTE_MENU_CACHE_STALE_MS: number;
export const SENATE_VOTE_MENU_CACHE_EXPIRY_WARN_MS: number;

export function isIngestMonitorHealthy(
  status: IngestMonitorStatus | string | null | undefined
): boolean;

export function isIngestMonitorOpsAcceptable(
  status: IngestMonitorStatus | string | null | undefined
): boolean;

export function isChamberHardSkipWarning(warning: string): boolean;
export function isSenateCacheFallbackWarning(warning: string): boolean;
export function isIngestTruncationWarning(warning: string): boolean;
export function isDegradedChamberWarning(warning: string): boolean;
export function isIntroListFailureWarning(warning: string): boolean;

export function classifyChamberWarningSeverity(
  warnings: readonly string[]
): "none" | "degraded" | "failed";

export function resolveScheduledSuccess<T>(
  dedicated: T | null,
  latest: T | null
): T | null;

export function buildSenateVoteMenuCacheMonitor(
  fetchedAt: string | null | undefined,
  now?: Date | string
): SenateVoteMenuCacheMonitor | null;

export function evaluateIngestMonitorStatus<
  T extends { trigger: FeedPipelineTrigger; completed_at: string },
>(params: {
  now: Date | string;
  staleAfterHours: number;
  scheduledSuccess: T | null;
  lastFailure: FeedPipelineFailureRecord | null;
  chamberWarnings?: readonly string[] | null;
  senateVoteMenuCache?: SenateVoteMenuCacheMonitor | null;
  introWarnings?: readonly string[] | null;
  missingDigestCount?: number;
  sanitizeFailureError?: (error: string) => string;
}): {
  status: IngestMonitorStatus;
  message: string;
  last_scheduled_success: T | null;
};

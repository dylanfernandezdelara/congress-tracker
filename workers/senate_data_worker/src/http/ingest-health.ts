import { floorQuietDays, isFloorQuietDays } from "../../../../shared/floor-quiet";
import { parseIsoDay } from "../../../../shared/iso-day";
import type {
  ExecutiveIngestMonitorPayload,
  ExecutivePipelineRunRecord,
  FeedPipelineFailureRecord,
  FeedPipelineRunRecord,
  FeedPipelineSkipRecord,
  FeedPipelineTrigger,
  IngestMonitorPayload,
  IngestMonitorStatus,
  SenateVoteMenuCacheMonitor,
} from "../../../../shared/ingest-api-types";
import {
  evaluateIngestMonitorStatus as evaluateIngestMonitorStatusShared,
  resolveScheduledSuccess,
} from "../../../../shared/ingest-monitor-status";
import { sanitizePipelineErrorPublic } from "./pipeline-error";

function asIngestStatus(status: IngestMonitorStatus | string): IngestMonitorStatus {
  return status as IngestMonitorStatus;
}

function sanitizeFailureRecord(
  record: FeedPipelineFailureRecord | null
): FeedPipelineFailureRecord | null {
  if (!record) return null;
  return {
    ...record,
    error: sanitizePipelineErrorPublic(record.error),
  };
}

function sanitizeChamberWarnings(
  warnings: readonly string[] | null | undefined
): string[] {
  if (!warnings?.length) return [];
  return warnings.map((w) => sanitizePipelineErrorPublic(w));
}

function sanitizeRunRecord(
  record: FeedPipelineRunRecord | null
): FeedPipelineRunRecord | null {
  if (!record) return null;
  if (!record.chamber_warnings?.length) return record;
  return {
    ...record,
    chamber_warnings: sanitizeChamberWarnings(record.chamber_warnings),
  };
}

/** Worker-facing evaluator: always sanitizes failure text for public monitors. */
export function evaluateIngestMonitorStatus<
  T extends { trigger: FeedPipelineTrigger; completed_at: string },
>(params: {
  now: Date;
  staleAfterHours: number;
  scheduledSuccess: T | null;
  lastFailure: FeedPipelineFailureRecord | null;
  chamberWarnings?: readonly string[] | null;
  senateVoteMenuCache?: SenateVoteMenuCacheMonitor | null;
}): {
  status: IngestMonitorStatus;
  message: string;
  last_scheduled_success: T | null;
} {
  const evaluated = evaluateIngestMonitorStatusShared({
    ...params,
    sanitizeFailureError: sanitizePipelineErrorPublic,
  });
  return {
    status: asIngestStatus(evaluated.status),
    message: evaluated.message,
    last_scheduled_success: evaluated.last_scheduled_success as T | null,
  };
}

export function buildIngestMonitorPayload(params: {
  now: Date;
  staleAfterHours: number;
  dailyCronUtc: string;
  latestPassageVoteDate: string | null;
  missingDigestCount: number;
  lastSuccess: FeedPipelineRunRecord | null;
  lastScheduledSuccess: FeedPipelineRunRecord | null;
  lastFailure: FeedPipelineFailureRecord | null;
  lastSkipped: FeedPipelineSkipRecord | null;
  senateVoteMenuCache?: SenateVoteMenuCacheMonitor | null;
  executive?: {
    staleAfterHours: number;
    hourlyCronUtc: string;
    lastSuccess: ExecutivePipelineRunRecord | null;
    lastScheduledSuccess: ExecutivePipelineRunRecord | null;
    lastFailure: FeedPipelineFailureRecord | null;
  };
}): IngestMonitorPayload {
  const scheduledSuccess = resolveScheduledSuccess(
    params.lastScheduledSuccess,
    params.lastSuccess
  );
  // Prefer chamber_warnings from the newest success (often an admin remediation
  // after menu refresh). Scheduled freshness still comes from scheduledSuccess;
  // sticky scheduled hard-skip warnings must not keep paging after a newer clean run.
  const newestSuccess = params.lastSuccess ?? scheduledSuccess;
  const publicWarnings = sanitizeChamberWarnings(newestSuccess?.chamber_warnings);
  const evaluated = evaluateIngestMonitorStatus({
    now: params.now,
    staleAfterHours: params.staleAfterHours,
    scheduledSuccess,
    lastFailure: params.lastFailure,
    chamberWarnings: publicWarnings,
    senateVoteMenuCache: params.senateVoteMenuCache ?? null,
  });

  const quietDays = floorQuietDays(params.latestPassageVoteDate, params.now);
  const quietDay = parseIsoDay(params.latestPassageVoteDate);
  const annotations: string[] = [];
  if (isFloorQuietDays(quietDays) && quietDay) {
    annotations.push(
      `Floor has been quiet since ${quietDay} (${quietDays} day(s) with no new passage votes).`
    );
  }
  if (params.missingDigestCount > 0) {
    annotations.push(`${params.missingDigestCount} feed bill(s) missing digests.`);
  }
  const canAnnotate = evaluated.status === "ok" || evaluated.status === "degraded";
  const message =
    canAnnotate && annotations.length > 0
      ? [evaluated.message, ...annotations].join(" ")
      : evaluated.message;

  const executive = params.executive
    ? buildExecutiveIngestMonitorPayload({
        now: params.now,
        staleAfterHours: params.executive.staleAfterHours,
        hourlyCronUtc: params.executive.hourlyCronUtc,
        lastSuccess: params.executive.lastSuccess,
        lastScheduledSuccess: params.executive.lastScheduledSuccess,
        lastFailure: params.executive.lastFailure,
      })
    : undefined;

  return {
    status: evaluated.status,
    message,
    daily_cron_utc: params.dailyCronUtc,
    stale_after_hours: params.staleAfterHours,
    latest_passage_vote_date: params.latestPassageVoteDate,
    floor_quiet_days: quietDays,
    missing_digest_count: params.missingDigestCount,
    last_success: sanitizeRunRecord(params.lastSuccess),
    last_failure: sanitizeFailureRecord(params.lastFailure),
    last_scheduled_success: sanitizeRunRecord(evaluated.last_scheduled_success),
    last_skipped: params.lastSkipped,
    senate_vote_menu_cache: params.senateVoteMenuCache ?? null,
    admin_feed_ingest: "POST /__pipeline/run/feed (Authorization: Bearer <PIPELINE_ADMIN_TOKEN>)",
    executive,
  };
}

function buildExecutiveIngestMonitorPayload(params: {
  now: Date;
  staleAfterHours: number;
  hourlyCronUtc: string;
  lastSuccess: ExecutivePipelineRunRecord | null;
  lastScheduledSuccess: ExecutivePipelineRunRecord | null;
  lastFailure: FeedPipelineFailureRecord | null;
}): ExecutiveIngestMonitorPayload {
  const scheduledSuccess = resolveScheduledSuccess(
    params.lastScheduledSuccess,
    params.lastSuccess
  );
  const evaluated = evaluateIngestMonitorStatus({
    now: params.now,
    staleAfterHours: params.staleAfterHours,
    scheduledSuccess,
    lastFailure: params.lastFailure,
  });

  return {
    status: evaluated.status,
    message: evaluated.message,
    hourly_cron_utc: params.hourlyCronUtc,
    stale_after_hours: params.staleAfterHours,
    last_success: params.lastSuccess,
    last_failure: sanitizeFailureRecord(params.lastFailure),
    last_scheduled_success: evaluated.last_scheduled_success,
    admin_executive_ingest:
      "POST /__pipeline/run/executive-posts (Authorization: Bearer <PIPELINE_ADMIN_TOKEN>)",
  };
}

export {
  isIngestMonitorHealthy,
  isIngestMonitorOpsAcceptable,
} from "../../../../shared/ingest-monitor-status";

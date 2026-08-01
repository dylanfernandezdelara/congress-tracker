import type {
  ExecutiveIngestMonitorPayload,
  ExecutivePipelineRunRecord,
  FeedPipelineFailureRecord,
  FeedPipelineRunRecord,
  FeedPipelineSkipRecord,
  FeedPipelineTrigger,
  IngestMonitorPayload,
  IngestMonitorStatus,
} from "../../../../shared/ingest-api-types";
import { classifyChamberWarningSeverity } from "../../../../shared/ingest-monitor-status";
import { sanitizePipelineErrorPublic } from "./pipeline-error";

function sanitizeFailureRecord(
  record: FeedPipelineFailureRecord | null
): FeedPipelineFailureRecord | null {
  if (!record) return null;
  return {
    ...record,
    error: sanitizePipelineErrorPublic(record.error),
  };
}

/** Prefer dedicated scheduled key; fall back to latest (admin-only still yields unknown). */
function resolveScheduledSuccess<T extends { trigger: FeedPipelineTrigger }>(
  dedicated: T | null,
  latest: T | null
): T | null {
  return dedicated ?? latest;
}

export function evaluateIngestMonitorStatus<
  T extends { trigger: FeedPipelineTrigger; completed_at: string },
>(params: {
  now: Date;
  staleAfterHours: number;
  /** Resolved scheduled-success candidate (dedicated key or latest fallback). */
  scheduledSuccess: T | null;
  lastFailure: FeedPipelineFailureRecord | null;
  /** Chamber warnings from the newest feed success (admin remediation may clear sticky scheduled hard-skips). */
  chamberWarnings?: readonly string[] | null;
}): {
  status: IngestMonitorStatus;
  message: string;
  last_scheduled_success: T | null;
} {
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
    const publicError = sanitizePipelineErrorPublic(lastScheduledFailure.error);
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

  const ageMs = params.now.getTime() - Date.parse(lastScheduledSuccess.completed_at);
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
  if (warningSeverity === "degraded") {
    return {
      status: "degraded",
      message: `Partial chamber ingest: ${warnings.join("; ")}`,
      last_scheduled_success: lastScheduledSuccess,
    };
  }

  return {
    status: "ok",
    message: "Scheduled ingest completed within the expected window.",
    last_scheduled_success: lastScheduledSuccess,
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
  const evaluated = evaluateIngestMonitorStatus({
    now: params.now,
    staleAfterHours: params.staleAfterHours,
    scheduledSuccess,
    lastFailure: params.lastFailure,
    chamberWarnings: newestSuccess?.chamber_warnings ?? [],
  });

  let message = evaluated.message;
  if (
    params.missingDigestCount > 0 &&
    (evaluated.status === "ok" || evaluated.status === "degraded")
  ) {
    message = `${message} ${params.missingDigestCount} bill(s) missing digests.`;
  }

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
    missing_digest_count: params.missingDigestCount,
    last_success: params.lastSuccess,
    last_failure: sanitizeFailureRecord(params.lastFailure),
    last_scheduled_success: evaluated.last_scheduled_success,
    last_skipped: params.lastSkipped,
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

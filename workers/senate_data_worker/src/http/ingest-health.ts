import type {
  ExecutiveIngestMonitorPayload,
  ExecutivePipelineRunRecord,
  FeedPipelineFailureRecord,
  FeedPipelineRunRecord,
  FeedPipelineSkipRecord,
  IngestMonitorPayload,
  IngestMonitorStatus,
} from "../../../../shared/ingest-api-types";
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

type ScheduledPipelineSuccess = FeedPipelineRunRecord | ExecutivePipelineRunRecord;

export function evaluateIngestMonitorStatus(params: {
  now: Date;
  staleAfterHours: number;
  lastSuccess: ScheduledPipelineSuccess | null;
  lastFailure: FeedPipelineFailureRecord | null;
}): {
  status: IngestMonitorStatus;
  message: string;
  last_scheduled_success: ScheduledPipelineSuccess | null;
} {
  const lastScheduledSuccess =
    params.lastSuccess?.trigger === "scheduled" ? params.lastSuccess : null;
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
  lastScheduledSuccess?: FeedPipelineRunRecord | null;
  lastFailure: FeedPipelineFailureRecord | null;
  lastSkipped?: FeedPipelineSkipRecord | null;
  executive?: {
    staleAfterHours: number;
    hourlyCronUtc: string;
    lastSuccess: ExecutivePipelineRunRecord | null;
    lastScheduledSuccess?: ExecutivePipelineRunRecord | null;
    lastFailure: FeedPipelineFailureRecord | null;
  };
}): IngestMonitorPayload {
  const scheduledSuccess = params.lastScheduledSuccess ?? params.lastSuccess;
  const evaluated = evaluateIngestMonitorStatus({
    now: params.now,
    staleAfterHours: params.staleAfterHours,
    lastSuccess: scheduledSuccess,
    lastFailure: params.lastFailure,
  });

  let message = evaluated.message;
  const warnings = scheduledSuccess?.chamber_warnings ?? [];
  if (warnings.length > 0 && evaluated.status === "ok") {
    message = `${message} Partial chamber ingest: ${warnings.join("; ")}`;
  }
  if (params.missingDigestCount > 0 && evaluated.status === "ok") {
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
    last_scheduled_success:
      (evaluated.last_scheduled_success as FeedPipelineRunRecord | null) ?? null,
    last_skipped: params.lastSkipped ?? null,
    admin_feed_ingest: "POST /__pipeline/run/feed (Authorization: Bearer <PIPELINE_ADMIN_TOKEN>)",
    executive,
  };
}

function buildExecutiveIngestMonitorPayload(params: {
  now: Date;
  staleAfterHours: number;
  hourlyCronUtc: string;
  lastSuccess: ExecutivePipelineRunRecord | null;
  lastScheduledSuccess?: ExecutivePipelineRunRecord | null;
  lastFailure: FeedPipelineFailureRecord | null;
}): ExecutiveIngestMonitorPayload {
  // Mirror feed: prefer the durable scheduled-only key; when absent (pre-migration
  // D1), fall back to lastSuccess so a still-scheduled latest record stays honest.
  // An admin-only lastSuccess must not be treated as cron health.
  const scheduledSuccess = params.lastScheduledSuccess ?? params.lastSuccess;
  const evaluated = evaluateIngestMonitorStatus({
    now: params.now,
    staleAfterHours: params.staleAfterHours,
    lastSuccess: scheduledSuccess,
    lastFailure: params.lastFailure,
  });

  return {
    status: evaluated.status,
    message: evaluated.message,
    hourly_cron_utc: params.hourlyCronUtc,
    stale_after_hours: params.staleAfterHours,
    last_success: params.lastSuccess,
    last_failure: sanitizeFailureRecord(params.lastFailure),
    last_scheduled_success:
      (evaluated.last_scheduled_success as ExecutivePipelineRunRecord | null) ?? null,
    admin_executive_ingest:
      "POST /__pipeline/run/executive-posts (Authorization: Bearer <PIPELINE_ADMIN_TOKEN>)",
  };
}

export function isIngestMonitorHealthy(status: IngestMonitorStatus): boolean {
  return status === "ok";
}

import type {
  FeedPipelineFailureRecord,
  FeedPipelineRunRecord,
  IngestMonitorPayload,
  IngestMonitorStatus,
} from "../../../../shared/ingest-api-types";

export function evaluateIngestMonitorStatus(params: {
  now: Date;
  staleAfterHours: number;
  lastSuccess: FeedPipelineRunRecord | null;
  lastFailure: FeedPipelineFailureRecord | null;
}): Pick<IngestMonitorPayload, "status" | "message" | "last_scheduled_success"> {
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
    return {
      status: "failed",
      message: `Last scheduled ingest failed: ${lastScheduledFailure.error}`,
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
      message: `Last scheduled ingest was ${lastScheduledSuccess.completed_at}; expected within ${params.staleAfterHours}h of daily cron.`,
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
  lastFailure: FeedPipelineFailureRecord | null;
}): IngestMonitorPayload {
  const evaluated = evaluateIngestMonitorStatus({
    now: params.now,
    staleAfterHours: params.staleAfterHours,
    lastSuccess: params.lastSuccess,
    lastFailure: params.lastFailure,
  });

  return {
    status: evaluated.status,
    message: evaluated.message,
    daily_cron_utc: params.dailyCronUtc,
    stale_after_hours: params.staleAfterHours,
    latest_passage_vote_date: params.latestPassageVoteDate,
    missing_digest_count: params.missingDigestCount,
    last_success: params.lastSuccess,
    last_failure: params.lastFailure,
    last_scheduled_success: evaluated.last_scheduled_success,
    admin_feed_ingest: "POST /__pipeline/run/feed (Authorization: Bearer <PIPELINE_ADMIN_TOKEN>)",
  };
}

export function isIngestMonitorHealthy(status: IngestMonitorStatus): boolean {
  return status === "ok";
}

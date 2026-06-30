/** Shared JSON contracts for ingest monitoring — consumed by worker and web. */

export type FeedPipelineTrigger = "scheduled" | "admin";

export interface FeedPipelineRunRecord {
  completed_at: string;
  trigger: FeedPipelineTrigger;
  votesUpserted: number;
  votesSkipped: number;
  billsSelected: number;
  digestsWritten: number;
  digestsSkipped: number;
  chamber_warnings?: string[];
}

export interface FeedPipelineFailureRecord {
  failed_at: string;
  trigger: FeedPipelineTrigger;
  error: string;
}

export type IngestMonitorStatus = "ok" | "stale" | "failed" | "unknown";

export interface IngestMonitorPayload {
  status: IngestMonitorStatus;
  message: string;
  daily_cron_utc: string;
  stale_after_hours: number;
  latest_passage_vote_date: string | null;
  missing_digest_count: number;
  last_success: FeedPipelineRunRecord | null;
  last_failure: FeedPipelineFailureRecord | null;
  last_scheduled_success: FeedPipelineRunRecord | null;
  admin_feed_ingest: string;
  executive?: ExecutiveIngestMonitorPayload;
}

export interface ExecutivePipelineRunRecord {
  completed_at: string;
  trigger: FeedPipelineTrigger;
  fetched: number;
  ingested: number;
  linked: number;
  hydrated: number;
  skipped: number;
}

export interface ExecutiveIngestMonitorPayload {
  status: IngestMonitorStatus;
  message: string;
  hourly_cron_utc: string;
  stale_after_hours: number;
  last_success: ExecutivePipelineRunRecord | null;
  last_failure: FeedPipelineFailureRecord | null;
  last_scheduled_success: ExecutivePipelineRunRecord | null;
  admin_executive_ingest: string;
}

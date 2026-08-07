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
  /** Per-bill digest/sponsor fetch failures that did not abort the run. */
  digest_warnings?: string[];
  chamber_warnings?: string[];
  lifecycleRefreshed?: number;
  lifecycleSkipped?: number;
  lifecycle_warnings?: string[];
  textChangesRefreshed?: number;
  textChangesWithAddedProvisions?: number;
  text_changes_warnings?: string[];
  confirmationVotesUpserted?: number;
  confirmationNominationsFetched?: number;
  confirmationBackgroundsRewritten?: number;
  confirmationWikipediaLookups?: number;
  confirmation_warnings?: string[];
}

export interface FeedPipelineFailureRecord {
  failed_at: string;
  trigger: FeedPipelineTrigger;
  error: string;
}

/** Durable trace when a feed cron invocation skips without running (e.g. lease held). */
export interface FeedPipelineSkipRecord {
  skipped_at: string;
  trigger: FeedPipelineTrigger;
  reason: "pipeline_busy";
}

export type IngestMonitorStatus = "ok" | "degraded" | "stale" | "failed" | "unknown";

/** D1 Senate LIS vote-menu cache freshness (no XML body). */
export interface SenateVoteMenuCacheMonitor {
  fetched_at: string;
  age_hours: number;
  max_age_hours: number;
  stale: boolean;
  nearing_expiry: boolean;
  expired: boolean;
}

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
  last_skipped: FeedPipelineSkipRecord | null;
  /** Present when a Senate menu cache row exists for this congress/session. */
  senate_vote_menu_cache?: SenateVoteMenuCacheMonitor | null;
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

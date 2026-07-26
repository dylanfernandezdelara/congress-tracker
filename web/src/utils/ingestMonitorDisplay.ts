import type {
  FeedPipelineRunRecord,
  FeedPipelineSkipRecord,
  FeedPipelineTrigger,
} from '@congress-tracker/shared/ingest-api-types'

export interface RunIdentity {
  completed_at: string
  trigger: FeedPipelineTrigger
}

/**
 * Two absent runs say the same thing, so they collapse into one block. An absent
 * scheduled run next to a present admin run does not: "the cron has never
 * succeeded" is the answer an operator came for.
 */
export function isSameRun(a: RunIdentity | null, b: RunIdentity | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.completed_at === b.completed_at && a.trigger === b.trigger
}

/**
 * Only the newest skip is retained, so a months-old one still renders. A later
 * scheduled success means that skip is history, not a live alarm.
 */
export function isSkipSuperseded(
  skip: FeedPipelineSkipRecord,
  lastScheduledSuccess: FeedPipelineRunRecord | null,
): boolean {
  if (!lastScheduledSuccess) return false
  const skippedAt = Date.parse(skip.skipped_at)
  const succeededAt = Date.parse(lastScheduledSuccess.completed_at)
  if (Number.isNaN(skippedAt) || Number.isNaN(succeededAt)) return false
  return succeededAt > skippedAt
}

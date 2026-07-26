import type {
  FeedPipelineSkipRecord,
  FeedPipelineTrigger,
} from '@congress-tracker/shared/ingest-api-types'

export interface RunIdentity {
  completed_at: string
  trigger: FeedPipelineTrigger
}

/** Collapse identical run identities; keep distinct when only one side is absent. */
export function isSameRun(a: RunIdentity | null, b: RunIdentity | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.completed_at === b.completed_at && a.trigger === b.trigger
}

/** True when a later scheduled success makes this skip historical, not a live alarm. */
export function isSkipSuperseded(
  skip: FeedPipelineSkipRecord,
  lastScheduledSuccess: Pick<RunIdentity, 'completed_at'> | null,
): boolean {
  if (!lastScheduledSuccess) return false
  const skippedAt = Date.parse(skip.skipped_at)
  const succeededAt = Date.parse(lastScheduledSuccess.completed_at)
  if (Number.isNaN(skippedAt) || Number.isNaN(succeededAt)) return false
  return succeededAt > skippedAt
}

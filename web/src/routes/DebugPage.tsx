import { Link } from 'react-router-dom'

import { fetchIngestMonitor } from '../api/client'
import type {
  ExecutiveIngestMonitorPayload,
  ExecutivePipelineRunRecord,
  FeedPipelineRunRecord,
  FeedPipelineSkipRecord,
  FeedPipelineTrigger,
  IngestMonitorStatus,
} from '@congress-tracker/shared/ingest-api-types'
import { useAsyncData } from '../hooks/useAsyncData'

const STATUS_LABEL: Record<IngestMonitorStatus, string> = {
  ok: 'Healthy',
  stale: 'Stale',
  failed: 'Failed',
  unknown: 'Unknown',
}

const SKIP_REASON_LABEL: Record<FeedPipelineSkipRecord['reason'], string> = {
  pipeline_busy:
    'Skipped because another pipeline held the write lease, so no new data was ingested on that invocation.',
}

function statusClass(status: IngestMonitorStatus): string {
  if (status === 'ok') return 'text-pass'
  if (status === 'failed') return 'text-fail'
  return 'text-secondary'
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  // Show the raw value rather than "Invalid Date"; on an ops page the unparseable
  // string is itself the diagnostic.
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { timeZoneName: 'short' })
}

interface RunIdentity {
  completed_at: string
  trigger: FeedPipelineTrigger
}

/**
 * Two absent runs say the same thing, so they collapse into one block. An absent
 * scheduled run next to a present admin run does not: "the cron has never
 * succeeded" is the answer an operator came to this page for.
 */
function isSameRun(a: RunIdentity | null, b: RunIdentity | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.completed_at === b.completed_at && a.trigger === b.trigger
}

/**
 * Only the newest skip is retained, so a months-old one still renders. A later
 * scheduled success means that skip is history, not a live alarm.
 */
function isSkipSuperseded(
  skip: FeedPipelineSkipRecord,
  lastScheduledSuccess: FeedPipelineRunRecord | null,
): boolean {
  if (!lastScheduledSuccess) return false
  const skippedAt = Date.parse(skip.skipped_at)
  const succeededAt = Date.parse(lastScheduledSuccess.completed_at)
  if (Number.isNaN(skippedAt) || Number.isNaN(succeededAt)) return false
  return succeededAt > skippedAt
}

function FeedRunDetails({ run }: { run: FeedPipelineRunRecord }) {
  return (
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-secondary">Completed</dt>
        <dd>{formatTimestamp(run.completed_at)}</dd>
      </div>
      <div>
        <dt className="text-secondary">Trigger</dt>
        <dd>{run.trigger}</dd>
      </div>
      <div>
        <dt className="text-secondary">Votes upserted</dt>
        <dd>{run.votesUpserted}</dd>
      </div>
      <div>
        <dt className="text-secondary">Digests written</dt>
        <dd>{run.digestsWritten}</dd>
      </div>
      <div>
        <dt className="text-secondary">Digests skipped</dt>
        <dd>{run.digestsSkipped}</dd>
      </div>
    </dl>
  )
}

function ExecutiveRunDetails({ run }: { run: ExecutivePipelineRunRecord }) {
  return (
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-secondary">Completed</dt>
        <dd>{formatTimestamp(run.completed_at)}</dd>
      </div>
      <div>
        <dt className="text-secondary">Trigger</dt>
        <dd>{run.trigger}</dd>
      </div>
      <div>
        <dt className="text-secondary">Fetched</dt>
        <dd>{run.fetched}</dd>
      </div>
      <div>
        <dt className="text-secondary">Ingested</dt>
        <dd>{run.ingested}</dd>
      </div>
      <div>
        <dt className="text-secondary">Linked</dt>
        <dd>{run.linked}</dd>
      </div>
      <div>
        <dt className="text-secondary">Hydrated</dt>
        <dd>{run.hydrated}</dd>
      </div>
      <div>
        <dt className="text-secondary">Skipped</dt>
        <dd>{run.skipped}</dd>
      </div>
    </dl>
  )
}

function ExecutiveMonitorSection({ executive }: { executive: ExecutiveIngestMonitorPayload }) {
  const showScheduledSuccess = !isSameRun(executive.last_success, executive.last_scheduled_success)

  return (
    <section
      className="rounded-card border border-border bg-card p-5"
      aria-label="Executive ingest status"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">Executive posts cron</h2>
        <p className={`text-sm font-medium ${statusClass(executive.status)}`}>
          {STATUS_LABEL[executive.status]}
        </p>
      </div>
      <p className="mt-2 text-sm text-secondary">{executive.message}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-secondary">Cron (UTC)</dt>
          <dd className="font-medium">{executive.hourly_cron_utc}</dd>
        </div>
        <div>
          <dt className="text-secondary">Stale after</dt>
          <dd className="font-medium">{executive.stale_after_hours} hours</dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-base font-medium">Last success</h3>
        {executive.last_success ? (
          <ExecutiveRunDetails run={executive.last_success} />
        ) : (
          <p className="mt-2 text-sm text-secondary">No success recorded yet.</p>
        )}
      </div>

      {showScheduledSuccess && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-base font-medium">Last scheduled success</h3>
          {executive.last_scheduled_success ? (
            <ExecutiveRunDetails run={executive.last_scheduled_success} />
          ) : (
            <p className="mt-2 text-sm text-secondary">No scheduled success recorded yet.</p>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-base font-medium">Last failure</h3>
        {executive.last_failure ? (
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-secondary">Failed at</dt>
              <dd>{formatTimestamp(executive.last_failure.failed_at)}</dd>
            </div>
            <div>
              <dt className="text-secondary">Trigger</dt>
              <dd>{executive.last_failure.trigger}</dd>
            </div>
            <div>
              <dt className="text-secondary">Error</dt>
              <dd className="break-words text-fail">{executive.last_failure.error}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-secondary">No recorded failures.</p>
        )}
      </div>

      <p className="mt-4 text-sm text-secondary">
        Manual override:{' '}
        <code className="rounded bg-surface-subtle px-1">{executive.admin_executive_ingest}</code>
      </p>
    </section>
  )
}

export default function DebugPage() {
  const monitor = useAsyncData({
    deps: [],
    load: fetchIngestMonitor,
    mapError: (err) => (err instanceof Error ? err.message : 'Could not load ingest monitor'),
  })

  const ingest = monitor.data?.ingest
  const showScheduledSuccess =
    ingest != null && !isSameRun(ingest.last_success, ingest.last_scheduled_success)

  return (
    <main id="content" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-secondary">Internal ops</p>
        <h1 className="text-2xl font-semibold tracking-tight">Ingest monitor</h1>
        <p className="text-sm text-secondary">
          Ops view for feed and executive ingest health. Not linked in site navigation.
        </p>
      </header>

      {monitor.isLoading && (
        <p className="rounded-xl border border-border bg-card px-4 py-6 text-secondary">
          Loading ingest status…
        </p>
      )}

      {monitor.error && (
        <p className="rounded-xl border border-border bg-card px-4 py-6 text-fail" role="alert">
          {monitor.error}
        </p>
      )}

      {ingest && (
        <>
          <section
            className="rounded-card border border-border bg-card p-5"
            aria-label="Ingest status"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-medium">Daily cron</h2>
              <p className={`text-sm font-medium ${statusClass(ingest.status)}`}>
                {STATUS_LABEL[ingest.status]}
              </p>
            </div>
            <p className="mt-2 text-sm text-secondary">{ingest.message}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-secondary">Cron (UTC)</dt>
                <dd className="font-medium">{ingest.daily_cron_utc}</dd>
              </div>
              <div>
                <dt className="text-secondary">Stale after</dt>
                <dd className="font-medium">{ingest.stale_after_hours} hours</dd>
              </div>
              <div>
                <dt className="text-secondary">Latest passage vote in D1</dt>
                <dd className="font-medium">{ingest.latest_passage_vote_date ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-secondary">Missing digests</dt>
                <dd className="font-medium">{ingest.missing_digest_count}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-card border border-border bg-card p-5">
            <h2 className="text-lg font-medium">Last success</h2>
            <p className="mt-1 text-sm text-secondary">
              Most recent successful feed run of any trigger (admin or scheduled).
            </p>
            {ingest.last_success ? (
              <FeedRunDetails run={ingest.last_success} />
            ) : (
              <p className="mt-2 text-sm text-secondary">No success recorded yet.</p>
            )}
          </section>

          {showScheduledSuccess && (
            <section className="rounded-card border border-border bg-card p-5">
              <h2 className="text-lg font-medium">Last scheduled success</h2>
              <p className="mt-1 text-sm text-secondary">
                Most recent successful daily cron run (status above tracks this, not admin runs).
              </p>
              {ingest.last_scheduled_success ? (
                <FeedRunDetails run={ingest.last_scheduled_success} />
              ) : (
                <p className="mt-2 text-sm text-secondary">No scheduled success recorded yet.</p>
              )}
            </section>
          )}

          <section className="rounded-card border border-border bg-card p-5">
            <h2 className="text-lg font-medium">Last skipped</h2>
            {ingest.last_skipped ? (
              <dl className="mt-3 grid gap-2 text-sm">
                <div>
                  <dt className="text-secondary">Skipped at</dt>
                  <dd>{formatTimestamp(ingest.last_skipped.skipped_at)}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Trigger</dt>
                  <dd>{ingest.last_skipped.trigger}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Reason</dt>
                  <dd className="break-words">{SKIP_REASON_LABEL[ingest.last_skipped.reason]}</dd>
                </div>
                {isSkipSuperseded(ingest.last_skipped, ingest.last_scheduled_success) && (
                  <div>
                    <dt className="text-secondary">Superseded</dt>
                    <dd>A scheduled run has succeeded since this skip.</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-secondary">No recorded skips.</p>
            )}
          </section>

          <section className="rounded-card border border-border bg-card p-5">
            <h2 className="text-lg font-medium">Last failure</h2>
            {ingest.last_failure ? (
              <dl className="mt-3 grid gap-2 text-sm">
                <div>
                  <dt className="text-secondary">Failed at</dt>
                  <dd>{formatTimestamp(ingest.last_failure.failed_at)}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Trigger</dt>
                  <dd>{ingest.last_failure.trigger}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Error</dt>
                  <dd className="break-words text-fail">{ingest.last_failure.error}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-secondary">No recorded failures.</p>
            )}
          </section>

          {ingest.executive && <ExecutiveMonitorSection executive={ingest.executive} />}

          <section className="rounded-card border border-border bg-card p-5 text-[13px] text-secondary">
            <h2 className="text-base font-medium text-foreground">Alerting options</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                Cloudflare Workers Observability: filter logs for{' '}
                <code className="rounded bg-surface-subtle px-1">feed_pipeline_failed</code> or
                scheduled origin.
              </li>
              <li>
                External uptime check: poll{' '}
                <code className="rounded bg-surface-subtle px-1">/health</code> and alert when{' '}
                <code className="rounded bg-surface-subtle px-1">data.ingest.status</code> is not{' '}
                <code className="rounded bg-surface-subtle px-1">ok</code>.
              </li>
              <li>
                Busy-skip signal: poll{' '}
                <code className="rounded bg-surface-subtle px-1">/debug/ingest.json</code> and alert
                when{' '}
                <code className="rounded bg-surface-subtle px-1">ingest.last_skipped</code> is recent
                (feed cron aborted because another pipeline held the write lease).
              </li>
              <li>
                Manual override:{' '}
                <code className="rounded bg-surface-subtle px-1">{ingest.admin_feed_ingest}</code>
              </li>
            </ul>
            <p className="mt-4">
              JSON:{' '}
              <a className="underline decoration-link underline-offset-2" href="/debug/ingest.json">
                /debug/ingest.json
              </a>
            </p>
          </section>
        </>
      )}

      <p className="text-sm text-secondary">
        <Link className="underline decoration-link underline-offset-2" to="/">
          Back to feed
        </Link>
      </p>
    </main>
  )
}

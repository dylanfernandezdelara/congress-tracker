import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { FLOOR_QUIET_AFTER_DAYS } from '@congress-tracker/shared/floor-quiet'
import type {
  ExecutiveIngestMonitorPayload,
  ExecutivePipelineRunRecord,
  FeedPipelineFailureRecord,
  FeedPipelineRunRecord,
  FeedPipelineSkipRecord,
  IngestMonitorPayload,
  IngestMonitorStatus,
} from '@congress-tracker/shared/ingest-api-types'

import { fetchIngestMonitor } from '../api/client'
import { useAsyncData } from '../hooks/useAsyncData'
import { isSameRun, isSkipSuperseded, type RunIdentity } from '../utils/ingestMonitorDisplay'

const STATUS_LABEL: Record<IngestMonitorStatus, string> = {
  ok: 'Healthy',
  degraded: 'Degraded',
  stale: 'Stale',
  failed: 'Failed',
  unknown: 'Unknown',
}

const SKIP_REASON_LABEL: Record<FeedPipelineSkipRecord['reason'], string> = {
  pipeline_busy:
    'Skipped because another pipeline held the write lease, so no new data was ingested on that invocation.',
}

type RunMetric = { label: string; value: string | number }

function statusClass(status: IngestMonitorStatus): string {
  if (status === 'ok') return 'text-pass'
  if (status === 'failed') return 'text-fail'
  // degraded/stale/unknown: visible but not pager-red (degraded is a known tracked state)
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

function PipelineRunDetails({ run, metrics }: { run: RunIdentity; metrics: RunMetric[] }) {
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
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dt className="text-secondary">{metric.label}</dt>
          <dd>{metric.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function feedRunMetrics(run: FeedPipelineRunRecord): RunMetric[] {
  return [
    { label: 'Votes upserted', value: run.votesUpserted },
    { label: 'Digests written', value: run.digestsWritten },
    { label: 'Digests skipped', value: run.digestsSkipped },
  ]
}

function executiveRunMetrics(run: ExecutivePipelineRunRecord): RunMetric[] {
  return [
    { label: 'Fetched', value: run.fetched },
    { label: 'Ingested', value: run.ingested },
    { label: 'Linked', value: run.linked },
    { label: 'Hydrated', value: run.hydrated },
    { label: 'Skipped', value: run.skipped },
  ]
}

function FailureDetails({ failure }: { failure: FeedPipelineFailureRecord }) {
  return (
    <dl className="mt-3 grid gap-2 text-sm">
      <div>
        <dt className="text-secondary">Failed at</dt>
        <dd>{formatTimestamp(failure.failed_at)}</dd>
      </div>
      <div>
        <dt className="text-secondary">Trigger</dt>
        <dd>{failure.trigger}</dd>
      </div>
      <div>
        <dt className="text-secondary">Error</dt>
        <dd className="break-words text-fail">{failure.error}</dd>
      </div>
    </dl>
  )
}

function SkipDetails({
  skip,
  lastScheduledSuccess,
}: {
  skip: FeedPipelineSkipRecord
  lastScheduledSuccess: RunIdentity | null
}) {
  return (
    <dl className="mt-3 grid gap-2 text-sm">
      <div>
        <dt className="text-secondary">Skipped at</dt>
        <dd>{formatTimestamp(skip.skipped_at)}</dd>
      </div>
      <div>
        <dt className="text-secondary">Trigger</dt>
        <dd>{skip.trigger}</dd>
      </div>
      <div>
        <dt className="text-secondary">Reason</dt>
        <dd className="break-words">{SKIP_REASON_LABEL[skip.reason]}</dd>
      </div>
      {isSkipSuperseded(skip, lastScheduledSuccess) && (
        <div>
          <dt className="text-secondary">Superseded</dt>
          <dd>A scheduled run has succeeded since this skip.</dd>
        </div>
      )}
    </dl>
  )
}

function RunBlock<T extends RunIdentity>({
  title,
  description,
  run,
  emptyLabel,
  metricsFor,
}: {
  title: string
  description?: string
  run: T | null
  emptyLabel: string
  metricsFor: (run: T) => RunMetric[]
}) {
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-base font-medium">{title}</h3>
      {description ? <p className="mt-1 text-sm text-secondary">{description}</p> : null}
      {run ? (
        <PipelineRunDetails run={run} metrics={metricsFor(run)} />
      ) : (
        <p className="mt-2 text-sm text-secondary">{emptyLabel}</p>
      )}
    </div>
  )
}

function PipelineMonitorSection<T extends RunIdentity>({
  ariaLabel,
  title,
  status,
  message,
  cronUtc,
  staleAfterHours,
  headerExtras,
  lastSuccess,
  lastScheduledSuccess,
  lastSuccessDescription,
  lastScheduledSuccessDescription,
  metricsFor,
  lastFailure,
  lastSkipped,
  footer,
}: {
  ariaLabel: string
  title: string
  status: IngestMonitorStatus
  message: string
  cronUtc: string
  staleAfterHours: number
  headerExtras?: ReactNode
  lastSuccess: T | null
  lastScheduledSuccess: T | null
  lastSuccessDescription?: string
  lastScheduledSuccessDescription?: string
  metricsFor: (run: T) => RunMetric[]
  lastFailure: FeedPipelineFailureRecord | null
  lastSkipped?: FeedPipelineSkipRecord | null
  footer?: ReactNode
}) {
  const showScheduledSuccess = !isSameRun(lastSuccess, lastScheduledSuccess)
  const showSkip = lastSkipped !== undefined

  return (
    <section className="rounded-card border border-border bg-card p-5" aria-label={ariaLabel}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        <p className={`text-sm font-medium ${statusClass(status)}`}>{STATUS_LABEL[status]}</p>
      </div>
      <p className="mt-2 text-sm text-secondary">{message}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-secondary">Cron (UTC)</dt>
          <dd className="font-medium">{cronUtc}</dd>
        </div>
        <div>
          <dt className="text-secondary">Stale after</dt>
          <dd className="font-medium">{staleAfterHours} hours</dd>
        </div>
        {headerExtras}
      </dl>

      <RunBlock
        title="Last success"
        description={lastSuccessDescription}
        run={lastSuccess}
        emptyLabel="No success recorded yet."
        metricsFor={metricsFor}
      />

      {showScheduledSuccess && (
        <RunBlock
          title="Last scheduled success"
          description={lastScheduledSuccessDescription}
          run={lastScheduledSuccess}
          emptyLabel="No scheduled success recorded yet."
          metricsFor={metricsFor}
        />
      )}

      {showSkip && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-base font-medium">Last skipped</h3>
          {lastSkipped ? (
            <SkipDetails skip={lastSkipped} lastScheduledSuccess={lastScheduledSuccess} />
          ) : (
            <p className="mt-2 text-sm text-secondary">No recorded skips.</p>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-base font-medium">Last failure</h3>
        {lastFailure ? (
          <FailureDetails failure={lastFailure} />
        ) : (
          <p className="mt-2 text-sm text-secondary">No recorded failures.</p>
        )}
      </div>

      {footer}
    </section>
  )
}

function FeedMonitorSection({ ingest }: { ingest: IngestMonitorPayload }) {
  return (
    <PipelineMonitorSection
      ariaLabel="Ingest status"
      title="Daily cron"
      status={ingest.status}
      message={ingest.message}
      cronUtc={ingest.daily_cron_utc}
      staleAfterHours={ingest.stale_after_hours}
      headerExtras={
        <>
          <div>
            <dt className="text-secondary">Latest passage vote in D1</dt>
            <dd className="font-medium">
              {ingest.latest_passage_vote_date ?? '—'}
              {ingest.floor_quiet_days != null && ingest.floor_quiet_days >= FLOOR_QUIET_AFTER_DAYS
                ? ` (${ingest.floor_quiet_days}d quiet floor)`
                : ''}
            </dd>
          </div>
          <div>
            <dt className="text-secondary">Missing feed digests</dt>
            <dd className="font-medium">{ingest.missing_digest_count}</dd>
          </div>
        </>
      }
      lastSuccess={ingest.last_success}
      lastScheduledSuccess={ingest.last_scheduled_success}
      lastSuccessDescription="Most recent successful feed run of any trigger (admin or scheduled)."
      lastScheduledSuccessDescription="Most recent successful daily cron run (status above tracks this, not admin runs)."
      metricsFor={feedRunMetrics}
      lastFailure={ingest.last_failure}
      lastSkipped={ingest.last_skipped}
    />
  )
}

function ExecutiveMonitorSection({ executive }: { executive: ExecutiveIngestMonitorPayload }) {
  return (
    <PipelineMonitorSection
      ariaLabel="Executive ingest status"
      title="Executive posts cron"
      status={executive.status}
      message={executive.message}
      cronUtc={executive.hourly_cron_utc}
      staleAfterHours={executive.stale_after_hours}
      lastSuccess={executive.last_success}
      lastScheduledSuccess={executive.last_scheduled_success}
      metricsFor={executiveRunMetrics}
      lastFailure={executive.last_failure}
      footer={
        <p className="mt-4 text-sm text-secondary">
          Manual override:{' '}
          <code className="rounded bg-surface-subtle px-1">{executive.admin_executive_ingest}</code>
        </p>
      }
    />
  )
}

export default function DebugPage() {
  const monitor = useAsyncData({
    deps: [],
    load: fetchIngestMonitor,
    mapError: (err) => (err instanceof Error ? err.message : 'Could not load ingest monitor'),
  })

  const ingest = monitor.data?.ingest

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
          <FeedMonitorSection ingest={ingest} />

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
                <code className="rounded bg-surface-subtle px-1">/health</code> and page when{' '}
                <code className="rounded bg-surface-subtle px-1">data.ingest.status</code> is{' '}
                <code className="rounded bg-surface-subtle px-1">failed</code>,{' '}
                <code className="rounded bg-surface-subtle px-1">stale</code>, or{' '}
                <code className="rounded bg-surface-subtle px-1">unknown</code>. Sustained{' '}
                <code className="rounded bg-surface-subtle px-1">degraded</code> (Senate cache
                fallback) is a known tracked condition — refresh daily; do not page forever.
              </li>
              <li>
                Busy-skip signal: poll{' '}
                <code className="rounded bg-surface-subtle px-1">/debug/ingest.json</code> and alert
                when{' '}
                <code className="rounded bg-surface-subtle px-1">ingest.last_skipped</code> exists and
                is not superseded — superseded only when{' '}
                <code className="rounded bg-surface-subtle px-1">ingest.last_scheduled_success.completed_at</code>{' '}
                is later than{' '}
                <code className="rounded bg-surface-subtle px-1">skipped_at</code>. The field is sticky
                — non-null alone is not an alarm.
              </li>
              <li>
                Quiet floor: a large{' '}
                <code className="rounded bg-surface-subtle px-1">ingest.floor_quiet_days</code> with
                status <code className="rounded bg-surface-subtle px-1">ok</code> means the House and
                Senate have not published newer passage votes. Do not page that as stuck ingest.
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

import { Link } from 'react-router-dom'

import { fetchIngestMonitor } from '../api/client'
import type { IngestMonitorPayload } from '@congress-tracker/shared/ingest-api-types'
import { useAsyncData } from '../hooks/useAsyncData'

const STATUS_LABEL: Record<IngestMonitorPayload['status'], string> = {
  ok: 'Healthy',
  stale: 'Stale',
  failed: 'Failed',
  unknown: 'Unknown',
}

function statusClass(status: IngestMonitorPayload['status']): string {
  if (status === 'ok') return 'text-pass'
  if (status === 'failed') return 'text-fail'
  return 'text-secondary'
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, { timeZoneName: 'short' })
}

export default function DebugPage() {
  const monitor = useAsyncData({
    deps: [],
    load: fetchIngestMonitor,
    mapError: (err) => (err instanceof Error ? err.message : 'Could not load ingest monitor'),
  })

  const ingest = monitor.data?.ingest

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-secondary">Internal ops</p>
        <h1 className="text-2xl font-semibold tracking-tight">Ingest monitor</h1>
        <p className="text-sm text-secondary">
          Temporary debug view for daily feed ingest health. Not linked in site navigation.
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
            className="rounded-xl border border-border bg-card p-5 shadow-card"
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

          <section className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-lg font-medium">Last scheduled success</h2>
            {ingest.last_scheduled_success ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-secondary">Completed</dt>
                  <dd>{formatTimestamp(ingest.last_scheduled_success.completed_at)}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Votes upserted</dt>
                  <dd>{ingest.last_scheduled_success.votesUpserted}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Digests written</dt>
                  <dd>{ingest.last_scheduled_success.digestsWritten}</dd>
                </div>
                <div>
                  <dt className="text-secondary">Digests skipped</dt>
                  <dd>{ingest.last_scheduled_success.digestsSkipped}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-secondary">No scheduled success recorded yet.</p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-card">
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

          <section className="rounded-xl border border-border bg-card p-5 text-sm text-secondary shadow-card">
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

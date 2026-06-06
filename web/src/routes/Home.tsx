import { useAsyncData } from '../hooks/useAsyncData'
import { fetchHealth, type HealthResponse } from '../api/client'

export default function Home() {
  const { data, error, isLoading } = useAsyncData<HealthResponse>({
    deps: [],
    load: fetchHealth,
    mapError: () => 'Could not reach the worker at the configured API URL.',
  })

  return (
    <main className="space-y-6">
      <header className="space-y-2 border-b border-border pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Product reset
        </p>
        <h1 className="font-serif text-4xl font-semibold text-foreground">Congress Tracker</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          The app shell is running while congressional data models, storage, and UI are redesigned
          from scratch. Cloudflare Worker and D1 bindings remain wired; product APIs and tables are
          not defined yet.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
        <h2 className="text-lg font-semibold">Worker connectivity</h2>
        {isLoading ? <p className="mt-3 text-sm text-muted-foreground">Checking /health…</p> : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        {data ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{data.status}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Congress / session</dt>
              <dd className="font-medium">
                {data.congress} / {data.session}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target state</dt>
              <dd className="font-medium">{data.target_state}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Timestamp</dt>
              <dd className="font-medium">{data.timestamp}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </main>
  )
}

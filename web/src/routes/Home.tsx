import { useState } from 'react'

import { fetchFeed } from '../api/client'
import type { FeedItem } from '../api/types'
import { FeedCard } from '../components/FeedCard'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAsyncData } from '../hooks/useAsyncData'

const LOOKBACK_DAYS = 45

function FeedSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="skeleton-card" />
      <div className="skeleton-card" />
      <div className="skeleton-card" />
    </div>
  )
}

export default function Home() {
  const [retryKey, setRetryKey] = useState(0)
  const { data, error, isLoading } = useAsyncData<FeedItem[]>({
    deps: [retryKey],
    load: fetchFeed,
    mapError: () => "Couldn't load the feed.",
  })

  const showFeed = !isLoading && !error && data && data.length > 0

  return (
    <main className="space-y-5">
      <header className="space-y-4 pb-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-1">
            <h1 className="flex items-center gap-1.5 text-[15px] font-medium tracking-normal text-foreground">
              Congress Tracker
              <span className="inline-block h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            </h1>
            <ThemeToggle />
          </div>
          {data && !error && !isLoading ? (
            <p className="text-xs text-faint">
              {data.length} {data.length === 1 ? 'bill' : 'bills'} · last {LOOKBACK_DAYS} days
            </p>
          ) : null}
        </div>
        <p className="text-sm text-secondary">
          Plain-English summaries of every bill that just passed the House or Senate.
        </p>
        <div className="border-t border-border" />
      </header>

      {isLoading ? <FeedSkeleton /> : null}

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-8 text-center">
          <p className="text-sm text-secondary">{error}</p>
          <button type="button" className="ghost-button" onClick={() => setRetryKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      {!isLoading && !error && data?.length === 0 ? (
        <p className="text-sm text-faint">No passage votes in the last {LOOKBACK_DAYS} days.</p>
      ) : null}

      {showFeed ? (
        <section className="space-y-5">
          {data.map((item) => (
            <FeedCard key={`${item.bill.congress}-${item.bill.type}-${item.bill.number}`} item={item} />
          ))}
        </section>
      ) : null}
    </main>
  )
}

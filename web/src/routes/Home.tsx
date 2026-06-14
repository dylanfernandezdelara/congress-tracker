import { useState } from 'react'

import {
  fetchDefectors,
  fetchFeed,
  fetchPortfolioStats,
  fetchPulseStats,
  fetchSessionStats,
} from '../api/client'
import type {
  DefectorEntry,
  FeedItem,
  PortfolioMovers,
  PulseStatsResponse,
  SessionStatsResponse,
} from '../api/types'
import { FeedCard } from '../components/FeedCard'
import { LeftSidebar } from '../components/LeftSidebar'
import { PageShell } from '../components/PageShell'
import { RightRail } from '../components/RightRail'
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

  const reload = () => setRetryKey((k) => k + 1)

  const feed = useAsyncData<FeedItem[]>({
    deps: [retryKey],
    load: fetchFeed,
    mapError: () => "Couldn't load the feed.",
  })

  const session = useAsyncData<SessionStatsResponse>({
    deps: [retryKey],
    load: fetchSessionStats,
    mapError: () => "Couldn't load session stats.",
  })

  const pulse = useAsyncData<PulseStatsResponse>({
    deps: [retryKey],
    load: fetchPulseStats,
    mapError: () => "Couldn't load legislative pulse.",
  })

  const defectors = useAsyncData<{ house: DefectorEntry[]; senate: DefectorEntry[] }>({
    deps: [retryKey],
    load: async () => {
      const [house, senate] = await Promise.all([
        fetchDefectors('House'),
        fetchDefectors('Senate'),
      ])
      return { house: house.defectors, senate: senate.defectors }
    },
    mapError: () => "Couldn't load defectors.",
  })

  const portfolios = useAsyncData<{ house: PortfolioMovers; senate: PortfolioMovers }>({
    deps: [retryKey],
    load: async () => {
      const [house, senate] = await Promise.all([
        fetchPortfolioStats('House'),
        fetchPortfolioStats('Senate'),
      ])
      return { house, senate }
    },
    mapError: () => "Couldn't load portfolio stats.",
  })

  const showFeed = !feed.isLoading && !feed.error && feed.data && feed.data.length > 0

  return (
    <PageShell
      leftSidebar={
        <LeftSidebar
          session={session.data}
          defectors={defectors.data}
          portfolios={portfolios.data}
          sessionLoading={session.isLoading}
          defectorsLoading={defectors.isLoading}
          portfoliosLoading={portfolios.isLoading}
          sessionError={session.error}
          defectorsError={defectors.error}
          portfoliosError={portfolios.error}
          onRetry={reload}
        />
      }
      rightRail={
        <RightRail
          pulse={pulse.data}
          loading={pulse.isLoading}
          error={pulse.error}
          onRetry={reload}
        />
      }
    >
      <main className="space-y-5">
        {feed.isLoading ? <FeedSkeleton /> : null}

        {feed.error ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-8 text-center">
            <p className="text-sm text-secondary">{feed.error}</p>
            <button type="button" className="ghost-button" onClick={() => setRetryKey((k) => k + 1)}>
              Retry
            </button>
          </div>
        ) : null}

        {!feed.isLoading && !feed.error && feed.data?.length === 0 ? (
          <p className="text-sm text-faint">No passage votes in the last {LOOKBACK_DAYS} days.</p>
        ) : null}

        {showFeed && feed.data ? (
          <section className="space-y-5">
            {feed.data.map((item) => (
              <FeedCard key={`${item.bill.congress}-${item.bill.type}-${item.bill.number}`} item={item} />
            ))}
          </section>
        ) : null}
      </main>
    </PageShell>
  )
}

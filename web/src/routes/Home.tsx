import { useEffect, useState } from 'react'

import {
  fetchDefectors,
  fetchFeed,
  fetchPortfolioStats,
  fetchPulseStats,
  fetchSessionStats,
} from '../api/client'
import type {
  DefectorEntry,
  FeedPageResponse,
  PortfolioMovers,
  PulseStatsResponse,
  SessionStatsResponse,
} from '../api/types'
import { FeedCard } from '../components/FeedCard'
import { LeftSidebar } from '../components/LeftSidebar'
import { PageShell } from '../components/PageShell'
import { RightRail } from '../components/RightRail'
import {
  FEED_DESKTOP_PAGE_SIZE,
  FEED_MOBILE_PAGE_SIZE,
  MOBILE_MEDIA_QUERY,
} from '../constants/feed'
import { useAsyncData } from '../hooks/useAsyncData'
import { useMediaQuery } from '../hooks/useMediaQuery'

const LOOKBACK_DAYS = 45

/**
 * Load a per-chamber stat for both chambers, tolerating a single-chamber
 * failure. Throws only when both chambers reject (so the sidebar shows an
 * error), otherwise falls back to `empty` for the failed chamber.
 */
async function bothChambers<T>(
  load: (chamber: 'House' | 'Senate') => Promise<T>,
  empty: T,
): Promise<{ house: T; senate: T }> {
  const [houseResult, senateResult] = await Promise.allSettled([
    load('House'),
    load('Senate'),
  ])
  if (houseResult.status === 'rejected' && senateResult.status === 'rejected') {
    throw houseResult.reason
  }
  return {
    house: houseResult.status === 'fulfilled' ? houseResult.value : empty,
    senate: senateResult.status === 'fulfilled' ? senateResult.value : empty,
  }
}

function FeedSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="skeleton-card" />
      <div className="skeleton-card" />
      <div className="skeleton-card" />
    </div>
  )
}

function FeedPagination({
  page,
  pageCount,
  hasMore,
  isLoading,
  onPrevious,
  onNext,
}: {
  page: number
  pageCount: number
  hasMore: boolean
  isLoading: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  if (pageCount <= 1) return null

  return (
    <nav className="feed-pagination" aria-label="Feed pages">
      <button
        type="button"
        className="feed-pagination-button"
        onClick={onPrevious}
        disabled={page <= 0 || isLoading}
        aria-label="Previous page"
      >
        ‹
      </button>
      <p className="feed-pagination-status">
        {page + 1} / {pageCount}
      </p>
      <button
        type="button"
        className="feed-pagination-button"
        onClick={onNext}
        disabled={!hasMore || isLoading}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  )
}

export default function Home() {
  const [retryKey, setRetryKey] = useState(0)
  const [page, setPage] = useState(0)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const pageSize = isMobile ? FEED_MOBILE_PAGE_SIZE : FEED_DESKTOP_PAGE_SIZE
  const offset = page * pageSize

  const reload = () => {
    setPage(0)
    setRetryKey((k) => k + 1)
  }

  useEffect(() => {
    setPage(0)
  }, [isMobile])

  const feed = useAsyncData<FeedPageResponse>({
    deps: [retryKey, pageSize, offset],
    load: () => fetchFeed({ limit: pageSize, offset }),
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
    load: () =>
      bothChambers<DefectorEntry[]>(
        async (chamber) => (await fetchDefectors(chamber)).defectors,
        [],
      ),
    mapError: () => "Couldn't load defectors.",
  })

  const portfolios = useAsyncData<{ house: PortfolioMovers; senate: PortfolioMovers }>({
    deps: [retryKey],
    load: () =>
      bothChambers<PortfolioMovers>(fetchPortfolioStats, {
        gainers: [],
        losers: [],
        disclaimer: 'Estimates from public disclosures.',
      }),
    mapError: () => "Couldn't load portfolio stats.",
  })

  const items = feed.data?.items ?? []
  const total = feed.data?.total ?? 0
  const hasMore = feed.data?.has_more ?? false
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isInitialLoad = feed.isLoading && feed.data === null
  const isPageTransition =
    feed.isLoading && feed.data !== null && feed.data.offset !== offset
  const visibleItems = isPageTransition ? [] : items
  const showFeed = !feed.error && (visibleItems.length > 0 || isPageTransition)

  const goToPage = (nextPage: number) => {
    setPage(Math.max(0, Math.min(nextPage, pageCount - 1)))
  }

  useEffect(() => {
    if (page > 0 && page >= pageCount) {
      setPage(Math.max(0, pageCount - 1))
    }
  }, [page, pageCount])

  useEffect(() => {
    if (!showFeed || page === 0) return
    document.getElementById('feed-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [page, showFeed])

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
        {isInitialLoad ? <FeedSkeleton /> : null}

        {feed.error ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-8 text-center">
            <p className="text-sm text-secondary">{feed.error}</p>
            <button type="button" className="ghost-button" onClick={reload}>
              Retry
            </button>
          </div>
        ) : null}

        {!isInitialLoad && !feed.error && total === 0 ? (
          <p className="text-sm text-faint">No passage votes in the last {LOOKBACK_DAYS} days.</p>
        ) : null}

        {showFeed ? (
          <section id="feed-top" className="space-y-5">
            {isPageTransition ? <FeedSkeleton /> : null}

            {!isPageTransition
              ? visibleItems.map((item) => (
                  <FeedCard
                    key={`${item.bill.congress}-${item.bill.type}-${item.bill.number}`}
                    item={item}
                  />
                ))
              : null}

            {isMobile ? (
              <FeedPagination
                page={page}
                pageCount={pageCount}
                hasMore={hasMore}
                isLoading={feed.isLoading}
                onPrevious={() => goToPage(page - 1)}
                onNext={() => goToPage(page + 1)}
              />
            ) : null}
          </section>
        ) : null}
      </main>
    </PageShell>
  )
}

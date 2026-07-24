import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchFeed, fetchNotableVotes } from '../api/client'
import type { FeedItem, FeedPageResponse, NotableVotesResponse } from '../api/types'
import { FederalControlCompact } from '../components/FederalControlCompact'
import { FeedRow } from '../components/FeedRow'
import { LeftSidebar } from '../components/LeftSidebar'
import { NotableVotesSection } from '../components/NotableVotesSection'
import { RightRail } from '../components/RightRail'
import { FEED_PAGE_SIZE } from '../constants/feed'
import { useAsyncData } from '../hooks/useAsyncData'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useStatsData } from '../hooks/useStatsData'

const LOOKBACK_DAYS = 45
const DESKTOP_RAIL_QUERY = '(min-width: 1024px)'

function feedRowKey(item: FeedItem): string {
  return `${item.bill.congress}-${item.bill.type}-${item.bill.number}`
}

function FeedSkeleton() {
  return (
    <ul className="feed-list" aria-hidden="true">
      <li className="feed-row-skeleton" />
      <li className="feed-row-skeleton" />
      <li className="feed-row-skeleton" />
    </ul>
  )
}

export default function Home() {
  const [retryKey, setRetryKey] = useState(0)
  const [items, setItems] = useState<FeedItem[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const appendLockRef = useRef(false)
  const lastFeedModeRef = useRef<'replace' | 'append'>('replace')
  const pageSize = FEED_PAGE_SIZE
  const isDesktop = useMediaQuery(DESKTOP_RAIL_QUERY)

  const { reload: reloadStats, session, pulse, defectors, portfolios } = useStatsData()

  const loadFeedPage = useCallback(
    async (offset: number, mode: 'replace' | 'append') => {
      if (mode === 'append') {
        if (appendLockRef.current) return
        appendLockRef.current = true
      } else {
        // A replace supersedes any in-flight append; release the append lock so
        // Load more is not stuck after the replace settles first.
        appendLockRef.current = false
      }

      const requestId = ++requestIdRef.current
      lastFeedModeRef.current = mode
      if (mode === 'replace') {
        setIsInitialLoading(true)
        setIsLoadingMore(false)
        setFeedError(null)
      } else {
        setIsLoadingMore(true)
      }

      try {
        const page: FeedPageResponse = await fetchFeed({ limit: pageSize, offset })
        if (requestId !== requestIdRef.current) return

        setTotal(page.total)
        setHasMore(page.has_more)
        setNextOffset(page.offset + page.items.length)
        setItems((prev) => {
          if (mode === 'replace') return page.items
          const seen = new Set(prev.map(feedRowKey))
          const next = [...prev]
          for (const item of page.items) {
            const key = feedRowKey(item)
            if (!seen.has(key)) {
              seen.add(key)
              next.push(item)
            }
          }
          return next
        })
        setFeedError(null)
      } catch {
        if (requestId !== requestIdRef.current) return
        // Keep previously loaded rows on failure (initial or append).
        setFeedError("Couldn't load the feed.")
      } finally {
        if (mode === 'append' && requestId === requestIdRef.current) {
          appendLockRef.current = false
        }
        if (requestId === requestIdRef.current) {
          setIsInitialLoading(false)
          setIsLoadingMore(false)
        }
      }
    },
    [pageSize],
  )

  const reloadFeed = useCallback(() => {
    setExpandedRowKey(null)
    setRetryKey((k) => k + 1)
  }, [])

  const reloadAll = useCallback(() => {
    reloadFeed()
    reloadStats()
  }, [reloadFeed, reloadStats])

  useEffect(() => {
    void loadFeedPage(0, 'replace')
  }, [retryKey, loadFeedPage])

  const notableVotes = useAsyncData<NotableVotesResponse>({
    deps: [retryKey],
    load: () => fetchNotableVotes(3),
    mapError: () => "Couldn't load notable votes.",
  })

  const loadMore = () => {
    if (!hasMore || isLoadingMore || isInitialLoading) return
    void loadFeedPage(nextOffset, 'append')
  }

  const showFeed = items.length > 0
  const showSkeleton = isInitialLoading && items.length === 0
  const inFlight = isInitialLoading || isLoadingMore

  const federalControl = (
    <FederalControlCompact
      composition={session.data?.composition ?? null}
      loading={session.isLoading}
      error={session.error}
      onRetry={reloadStats}
    />
  )

  const memberSpotlights = (
    <LeftSidebar
      session={session}
      defectors={defectors}
      portfolios={portfolios}
      onRetry={reloadStats}
    />
  )

  const legislativePulse = (
    <RightRail
      pulse={pulse.data}
      loading={pulse.isLoading}
      error={pulse.error}
      onRetry={reloadStats}
    />
  )

  const notableVotesSection = (
    <NotableVotesSection
      variant="compact"
      notable={notableVotes.data?.notable ?? null}
      loading={notableVotes.isLoading}
      error={notableVotes.error}
      onRetry={reloadFeed}
    />
  )

  return (
    <div className="home-shell">
      {isDesktop ? (
        <aside className="home-rail home-rail--left" aria-label="Session context">
          <div className="home-rail-stack">
            {federalControl}
            <section aria-label="Members in Congress">{memberSpotlights}</section>
          </div>
        </aside>
      ) : null}

      <main className="home-feed-column feed-main">
        <header className="home-page-head">
          <h2 className="home-page-title">Congressional passage votes</h2>
          <p className="home-page-description">
            Passage votes, key provisions, and the lawmakers who crossed party lines.
          </p>
        </header>

        {showSkeleton ? <FeedSkeleton /> : null}

        {feedError && items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-card px-6 py-8 text-center">
            <p className="text-[13px] text-secondary">{feedError}</p>
            <button type="button" className="ghost-button" onClick={reloadAll}>
              Retry
            </button>
          </div>
        ) : null}

        {!showSkeleton && !feedError && total === 0 && !inFlight ? (
          <p className="text-[13px] text-faint">
            No passage votes in the last {LOOKBACK_DAYS} days.
          </p>
        ) : null}

        {showFeed ? (
          <section id="feed-top">
            <div className="home-feed-header">
              <h2 className="home-feed-title">Chronological timeline</h2>
              <p className="home-feed-count">
                {items.length} of {total} passage {total === 1 ? 'vote' : 'votes'}
              </p>
            </div>

            <ul className="feed-list">
              {items.map((item) => {
                const rowKey = feedRowKey(item)
                return (
                  <FeedRow
                    key={rowKey}
                    item={item}
                    isExpanded={expandedRowKey === rowKey}
                    onToggle={() =>
                      setExpandedRowKey((current) => (current === rowKey ? null : rowKey))
                    }
                  />
                )
              })}
            </ul>

            {feedError ? (
              <p className="feed-pagination-status" role="alert">
                {feedError}{' '}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    if (lastFeedModeRef.current === 'append' && hasMore) {
                      loadMore()
                    } else {
                      reloadFeed()
                    }
                  }}
                >
                  Retry
                </button>
              </p>
            ) : null}

            {hasMore || isLoadingMore ? (
              <nav className="feed-pagination" aria-label="Feed pages">
                <button
                  type="button"
                  className="feed-pagination-button"
                  onClick={loadMore}
                  disabled={!hasMore || inFlight}
                  aria-label="Load more"
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </button>
                <p className="feed-pagination-status">
                  {items.length} of {total} votes
                </p>
              </nav>
            ) : null}
          </section>
        ) : null}

        {!isDesktop ? (
          <div className="home-mobile-rails">
            <div className="home-mobile-rail-section">{notableVotesSection}</div>
            <section className="home-mobile-rail-section" aria-label="Legislative pulse">
              {legislativePulse}
            </section>
            <div className="home-mobile-rail-section">{federalControl}</div>
            <section className="home-mobile-rail-section" aria-label="Members in Congress">
              {memberSpotlights}
            </section>
          </div>
        ) : null}
      </main>

      {isDesktop ? (
        <aside className="home-rail home-rail--right" aria-label="Legislative context">
          <div className="home-rail-stack">
            <section aria-label="Legislative pulse">{legislativePulse}</section>
            {notableVotesSection}
          </div>
        </aside>
      ) : null}
    </div>
  )
}

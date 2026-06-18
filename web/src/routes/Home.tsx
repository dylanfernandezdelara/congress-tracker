import { useEffect, useState } from 'react'

import { fetchFeed } from '../api/client'
import type { FeedItem, FeedPageResponse } from '../api/types'
import { FeedRow } from '../components/FeedRow'
import {
  FEED_DESKTOP_PAGE_SIZE,
  FEED_MOBILE_PAGE_SIZE,
  MOBILE_MEDIA_QUERY,
} from '../constants/feed'
import { useAsyncData } from '../hooks/useAsyncData'
import { useMediaQuery } from '../hooks/useMediaQuery'

const LOOKBACK_DAYS = 45

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
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
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

  useEffect(() => {
    setExpandedRowKey(null)
  }, [page, offset, retryKey])

  const feed = useAsyncData<FeedPageResponse>({
    deps: [retryKey, pageSize, offset],
    load: () => fetchFeed({ limit: pageSize, offset }),
    mapError: () => "Couldn't load the feed.",
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

          {!isPageTransition ? (
            <ul className="feed-list">
              {visibleItems.map((item) => {
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
          ) : null}

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
  )
}

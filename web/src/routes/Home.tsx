import { useEffect, useState } from 'react'

import { fetchFeed, fetchNotableVotes } from '../api/client'
import type { FeedItem, FeedPageResponse, NotableVotesResponse } from '../api/types'
import { FeedRow } from '../components/FeedRow'
import { NotableVotesSection } from '../components/NotableVotesSection'
import { FEED_PAGE_SIZE } from '../constants/feed'
import { useAsyncData } from '../hooks/useAsyncData'

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
        Previous
      </button>
      <p className="feed-pagination-status">
        Page {page + 1} of {pageCount}
      </p>
      <button
        type="button"
        className="feed-pagination-button"
        onClick={onNext}
        disabled={!hasMore || isLoading}
        aria-label="Next page"
      >
        Next
      </button>
    </nav>
  )
}

export default function Home() {
  const [retryKey, setRetryKey] = useState(0)
  const [page, setPage] = useState(0)
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
  const pageSize = FEED_PAGE_SIZE
  const offset = page * pageSize

  const reload = () => {
    setPage(0)
    setRetryKey((k) => k + 1)
  }

  useEffect(() => {
    setExpandedRowKey(null)
  }, [offset, retryKey])

  const feed = useAsyncData<FeedPageResponse>({
    deps: [retryKey, pageSize, offset],
    load: () => fetchFeed({ limit: pageSize, offset }),
    mapError: () => "Couldn't load the feed.",
  })

  const notableVotes = useAsyncData<NotableVotesResponse>({
    deps: [retryKey],
    load: () => fetchNotableVotes(3),
    mapError: () => "Couldn't load notable votes.",
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
    <main className="feed-main space-y-5">
      <NotableVotesSection
        notable={notableVotes.data?.notable ?? null}
        loading={notableVotes.isLoading}
        error={notableVotes.error}
        onRetry={reload}
      />

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
          <div className="home-feed-header">
            <h2 className="home-feed-title">Chronological timeline</h2>
          </div>

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

          <FeedPagination
            page={page}
            pageCount={pageCount}
            hasMore={hasMore}
            isLoading={feed.isLoading}
            onPrevious={() => goToPage(page - 1)}
            onNext={() => goToPage(page + 1)}
          />
        </section>
      ) : null}
    </main>
  )
}

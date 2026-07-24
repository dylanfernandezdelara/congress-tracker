import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { fetchFeed } from '../api/client'
import type { FeedItem, FeedPageResponse } from '../api/types'
import { FEED_PAGE_SIZE } from '../constants/feed'
import {
  feedRowKey,
  formatBillQueryParam,
  itemMatchesBillParam,
} from '../utils/billDeepLink'
import { parseChamberFilter, type ChamberFilter } from '../utils/chamberFilter'

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scrollRowIntoView(rowKey: string) {
  // Keys are always `congress-type-number` (no quotes/spaces).
  const el = document.querySelector<HTMLElement>(`[data-feed-row-key="${rowKey}"]`)
  if (!el) return
  el.scrollIntoView({
    block: 'start',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
}

function deepLinkQueryKey(chamber: ChamberFilter | null, bill: string): string {
  return `${chamber ?? ''}|${bill}`
}

export function useFeedPagination() {
  const [searchParams, setSearchParams] = useSearchParams()
  const chamber = parseChamberFilter(searchParams.get('chamber'))
  const billParam = searchParams.get('bill')

  const [retryKey, setRetryKey] = useState(0)
  const [items, setItems] = useState<FeedItem[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null)
  const [feedSettled, setFeedSettled] = useState(false)
  const [billMissingNotice, setBillMissingNotice] = useState(false)

  const requestIdRef = useRef(0)
  const appendLockRef = useRef(false)
  const lastFeedModeRef = useRef<'replace' | 'append'>('replace')
  const deepLinkBillRef = useRef<string | null>(null)
  const deepLinkPhaseRef = useRef<'idle' | 'searching' | 'done'>('done')
  /** Chamber+bill pair currently being searched or already resolved for deep link. */
  const deepLinkQueryRef = useRef<string | null>(null)
  const chamberRef = useRef(chamber)
  chamberRef.current = chamber
  const loadedChamberRef = useRef<ChamberFilter | null | undefined>(undefined)

  const pageSize = FEED_PAGE_SIZE

  const clearDeepLinkState = useCallback(() => {
    deepLinkPhaseRef.current = 'done'
    deepLinkBillRef.current = null
    deepLinkQueryRef.current = null
  }, [])

  const replaceSearchParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          mutate(next)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const loadFeedPage = useCallback(
    async (offset: number, mode: 'replace' | 'append', chamberFilter: ChamberFilter | null) => {
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
        const page: FeedPageResponse = await fetchFeed({
          limit: pageSize,
          offset,
          ...(chamberFilter ? { chamber: chamberFilter } : {}),
        })
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
          // Open staged rail fetches after the first page attempt (success or error).
          setFeedSettled(true)
        }
      }
    },
    [pageSize],
  )

  const reloadFeed = useCallback(() => {
    setExpandedRowKey(null)
    setBillMissingNotice(false)
    clearDeepLinkState()
    replaceSearchParams((params) => {
      params.delete('bill')
    })
    setRetryKey((k) => k + 1)
  }, [clearDeepLinkState, replaceSearchParams])

  // Reset list immediately on chamber change so stale rows cannot be toggled/deep-linked
  // while the replacement page is in flight.
  useEffect(() => {
    if (loadedChamberRef.current !== undefined && loadedChamberRef.current !== chamber) {
      setItems([])
      setTotal(0)
      setHasMore(false)
      setNextOffset(0)
      setExpandedRowKey(null)
      setFeedError(null)
    }
    loadedChamberRef.current = chamber
    void loadFeedPage(0, 'replace', chamber)
  }, [retryKey, loadFeedPage, chamber])

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || isInitialLoading) return
    void loadFeedPage(nextOffset, 'append', chamberRef.current)
  }, [hasMore, isLoadingMore, isInitialLoading, loadFeedPage, nextOffset])

  const setChamberFilter = useCallback(
    (next: ChamberFilter | null) => {
      setExpandedRowKey(null)
      setBillMissingNotice(false)
      clearDeepLinkState()
      replaceSearchParams((params) => {
        if (next) params.set('chamber', next)
        else params.delete('chamber')
        params.delete('bill')
      })
    },
    [clearDeepLinkState, replaceSearchParams],
  )

  const toggleRow = useCallback(
    (item: FeedItem) => {
      const rowKey = feedRowKey(item)
      const bill = formatBillQueryParam(item.bill)
      let nextKey: string | null = null
      setExpandedRowKey((current) => {
        nextKey = current === rowKey ? null : rowKey
        return nextKey
      })
      // Keep deep-link query in sync so the URL bill write does not restart search/scroll.
      if (nextKey === null) {
        clearDeepLinkState()
        replaceSearchParams((params) => {
          params.delete('bill')
        })
      } else {
        deepLinkPhaseRef.current = 'done'
        deepLinkBillRef.current = bill
        deepLinkQueryRef.current = deepLinkQueryKey(chamberRef.current, bill)
        replaceSearchParams((params) => {
          params.set('bill', bill)
        })
      }
      setBillMissingNotice(false)
    },
    [clearDeepLinkState, replaceSearchParams],
  )

  const dismissBillMissingNotice = useCallback(() => {
    setBillMissingNotice(false)
    clearDeepLinkState()
    replaceSearchParams((params) => {
      params.delete('bill')
    })
  }, [clearDeepLinkState, replaceSearchParams])

  // Start (or restart) deep-link search when ?bill= and/or ?chamber= change together.
  useEffect(() => {
    if (!billParam) {
      clearDeepLinkState()
      setBillMissingNotice(false)
      return
    }
    const queryKey = deepLinkQueryKey(chamber, billParam)
    if (deepLinkQueryRef.current === queryKey) return
    deepLinkQueryRef.current = queryKey
    deepLinkBillRef.current = billParam
    deepLinkPhaseRef.current = 'searching'
    setBillMissingNotice(false)
  }, [billParam, chamber, clearDeepLinkState])

  // Deep-link: after pages load, find the bill or keep appending until exhausted.
  useEffect(() => {
    if (deepLinkPhaseRef.current !== 'searching') return
    if (isInitialLoading || isLoadingMore) return
    // Don't treat a failed fetch as "bill missing".
    if (feedError) return

    const target = deepLinkBillRef.current
    if (!target) {
      deepLinkPhaseRef.current = 'done'
      return
    }

    const found = items.find((item) => itemMatchesBillParam(item, target))
    if (found) {
      const rowKey = feedRowKey(found)
      setExpandedRowKey(rowKey)
      deepLinkPhaseRef.current = 'done'
      // Scroll after paint so the expanded panel is in the DOM.
      requestAnimationFrame(() => {
        scrollRowIntoView(rowKey)
      })
      return
    }

    if (hasMore) {
      void loadFeedPage(nextOffset, 'append', chamberRef.current)
      return
    }

    deepLinkPhaseRef.current = 'done'
    setBillMissingNotice(true)
  }, [items, hasMore, isInitialLoading, isLoadingMore, feedError, loadFeedPage, nextOffset])

  return {
    chamber,
    items,
    total,
    hasMore,
    feedError,
    isInitialLoading,
    isLoadingMore,
    expandedRowKey,
    feedSettled,
    billMissingNotice,
    lastFeedModeRef,
    reloadFeed,
    loadMore,
    setChamberFilter,
    toggleRow,
    dismissBillMissingNotice,
  }
}

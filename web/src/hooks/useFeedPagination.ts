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
import { parseStateFilter, type StateFilter } from '../utils/stateFilter'

const SEARCH_DEBOUNCE_MS = 300

type FeedFilters = {
  chamber: ChamberFilter | null
  state: StateFilter | null
  q: string
}

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

function deepLinkQueryKey(filters: FeedFilters, bill: string): string {
  return `${filters.chamber ?? ''}|${filters.state ?? ''}|${filters.q}|${bill}`
}

function parseSearchQuery(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function filtersEqual(a: FeedFilters, b: FeedFilters): boolean {
  return a.chamber === b.chamber && a.state === b.state && a.q === b.q
}

export function useFeedPagination() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters: FeedFilters = {
    chamber: parseChamberFilter(searchParams.get('chamber')),
    state: parseStateFilter(searchParams.get('state')),
    q: parseSearchQuery(searchParams.get('q')),
  }
  const billParam = searchParams.get('bill')

  const [retryKey, setRetryKey] = useState(0)
  const [draftQuery, setDraftQuery] = useState(filters.q)
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
  /** Filters+bill tuple currently being searched or already resolved for deep link. */
  const deepLinkQueryRef = useRef<string | null>(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const expandedRowKeyRef = useRef<string | null>(expandedRowKey)
  expandedRowKeyRef.current = expandedRowKey
  const loadedFilterRef = useRef<FeedFilters | undefined>(undefined)

  const pageSize = FEED_PAGE_SIZE

  const setExpandedKey = useCallback((key: string | null) => {
    expandedRowKeyRef.current = key
    setExpandedRowKey(key)
  }, [])

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
    async (offset: number, mode: 'replace' | 'append', nextFilters: FeedFilters) => {
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
          ...(nextFilters.chamber ? { chamber: nextFilters.chamber } : {}),
          ...(nextFilters.state ? { state: nextFilters.state } : {}),
          ...(nextFilters.q ? { q: nextFilters.q } : {}),
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
    setExpandedKey(null)
    setBillMissingNotice(false)
    clearDeepLinkState()
    replaceSearchParams((params) => {
      params.delete('bill')
    })
    setRetryKey((k) => k + 1)
  }, [clearDeepLinkState, replaceSearchParams, setExpandedKey])

  const commitSearchQuery = useCallback(
    (raw: string) => {
      const next = parseSearchQuery(raw)
      setDraftQuery(next)
      setExpandedKey(null)
      setBillMissingNotice(false)
      replaceSearchParams((params) => {
        if (next) params.set('q', next)
        else params.delete('q')
      })
    },
    [replaceSearchParams, setExpandedKey],
  )

  // Keep the input in sync when the URL changes externally (back/forward, deep link).
  useEffect(() => {
    setDraftQuery(filters.q)
  }, [filters.q])

  // Debounce draft → URL (immediate path handled by clear / Enter).
  useEffect(() => {
    if (parseSearchQuery(draftQuery) === filters.q) return
    const handle = window.setTimeout(() => {
      commitSearchQuery(draftQuery)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [draftQuery, filters.q, commitSearchQuery])

  // Reset expansion on filter change; keep rows visible while the replacement
  // page is in flight (skeleton only for true first load / empty list).
  useEffect(() => {
    const prev = loadedFilterRef.current
    if (prev !== undefined && !filtersEqual(prev, filters)) {
      setExpandedKey(null)
      setFeedError(null)
    }
    loadedFilterRef.current = filters
    void loadFeedPage(0, 'replace', filters)
  }, [retryKey, loadFeedPage, filters.chamber, filters.state, filters.q, setExpandedKey])

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || isInitialLoading) return
    void loadFeedPage(nextOffset, 'append', filtersRef.current)
  }, [hasMore, isLoadingMore, isInitialLoading, loadFeedPage, nextOffset])

  const setUrlFilter = useCallback(
    (key: 'chamber' | 'state', next: string | null) => {
      setExpandedKey(null)
      setBillMissingNotice(false)
      clearDeepLinkState()
      replaceSearchParams((params) => {
        if (next) params.set(key, next)
        else params.delete(key)
        params.delete('bill')
      })
    },
    [clearDeepLinkState, replaceSearchParams, setExpandedKey],
  )

  const setChamberFilter = useCallback(
    (next: ChamberFilter | null) => {
      setUrlFilter('chamber', next)
    },
    [setUrlFilter],
  )

  const setStateFilter = useCallback(
    (next: StateFilter | null) => {
      setUrlFilter('state', next)
    },
    [setUrlFilter],
  )

  const setSearchDraft = useCallback(
    (value: string) => {
      setDraftQuery(value)
      if (parseSearchQuery(value) === '') {
        commitSearchQuery('')
      }
    },
    [commitSearchQuery],
  )

  const submitSearch = useCallback(() => {
    commitSearchQuery(draftQuery)
  }, [commitSearchQuery, draftQuery])

  const clearSearch = useCallback(() => {
    commitSearchQuery('')
  }, [commitSearchQuery])

  const toggleRow = useCallback(
    (item: FeedItem) => {
      const rowKey = feedRowKey(item)
      const bill = formatBillQueryParam(item.bill)
      // Read from a ref — do not derive URL side effects from a useState updater.
      // Updaters are not guaranteed to run synchronously before the next line.
      const collapsing = expandedRowKeyRef.current === rowKey
      setExpandedKey(collapsing ? null : rowKey)
      // Keep deep-link query in sync so the URL bill write does not restart search/scroll.
      if (collapsing) {
        clearDeepLinkState()
        replaceSearchParams((params) => {
          params.delete('bill')
        })
      } else {
        deepLinkPhaseRef.current = 'done'
        deepLinkBillRef.current = bill
        deepLinkQueryRef.current = deepLinkQueryKey(filtersRef.current, bill)
        replaceSearchParams((params) => {
          params.set('bill', bill)
        })
      }
      setBillMissingNotice(false)
    },
    [clearDeepLinkState, replaceSearchParams, setExpandedKey],
  )

  const dismissBillMissingNotice = useCallback(() => {
    setBillMissingNotice(false)
    clearDeepLinkState()
    replaceSearchParams((params) => {
      params.delete('bill')
    })
  }, [clearDeepLinkState, replaceSearchParams])

  // Start (or restart) deep-link search when ?bill= and/or filter params change together.
  useEffect(() => {
    if (!billParam) {
      clearDeepLinkState()
      setBillMissingNotice(false)
      return
    }
    const queryKey = deepLinkQueryKey(filters, billParam)
    if (deepLinkQueryRef.current === queryKey) return
    deepLinkQueryRef.current = queryKey
    deepLinkBillRef.current = billParam
    deepLinkPhaseRef.current = 'searching'
    setBillMissingNotice(false)
  }, [billParam, filters.chamber, filters.state, filters.q, clearDeepLinkState])

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
      setExpandedKey(rowKey)
      deepLinkPhaseRef.current = 'done'
      // Scroll after paint so the expanded panel is in the DOM.
      requestAnimationFrame(() => {
        scrollRowIntoView(rowKey)
      })
      return
    }

    if (hasMore) {
      void loadFeedPage(nextOffset, 'append', filtersRef.current)
      return
    }

    deepLinkPhaseRef.current = 'done'
    setBillMissingNotice(true)
  }, [
    items,
    hasMore,
    isInitialLoading,
    isLoadingMore,
    feedError,
    loadFeedPage,
    nextOffset,
    setExpandedKey,
  ])

  return {
    chamber: filters.chamber,
    state: filters.state,
    searchQuery: filters.q,
    searchDraft: draftQuery,
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
    setStateFilter,
    setSearchDraft,
    submitSearch,
    clearSearch,
    toggleRow,
    dismissBillMissingNotice,
  }
}

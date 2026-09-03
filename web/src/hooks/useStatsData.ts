import { useState } from 'react'

import {
  fetchDefectors,
  fetchPortfolioStats,
  fetchSessionStats,
  fetchTightnessStats,
} from '../api/client'
import type {
  DefectorEntry,
  PortfolioMovers,
  SessionStatsResponse,
  TightnessStatsResponse,
} from '../api/types'
import { useAsyncData } from './useAsyncData'

export type ChamberPair<T> = {
  house: T
  senate: T
  houseError: string | null
  senateError: string | null
}

async function bothChambers<T>(
  load: (chamber: 'House' | 'Senate') => Promise<T>,
  empty: T,
  chamberErrorMessage: string,
): Promise<ChamberPair<T>> {
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
    houseError: houseResult.status === 'rejected' ? chamberErrorMessage : null,
    senateError: senateResult.status === 'rejected' ? chamberErrorMessage : null,
  }
}

export type UseStatsDataOptions = {
  /** When false, skip rail fetches (callers can still show loading UI). */
  enabled?: boolean
}

function withGateLoading<T>(result: {
  data: T | null
  error: string | null
  isLoading: boolean
}, enabled: boolean) {
  return {
    ...result,
    // While gated off — and on the frame when the gate opens before useAsyncData's
    // effect flips isLoading — keep loading chrome so rails don't flash empty.
    isLoading:
      !enabled ||
      result.isLoading ||
      (result.data === null && result.error === null),
  }
}

export function useStatsData(options: UseStatsDataOptions = {}) {
  const enabled = options.enabled ?? true
  const [retryKey, setRetryKey] = useState(0)

  const reload = () => setRetryKey((k) => k + 1)

  const session = useAsyncData<SessionStatsResponse>({
    deps: [retryKey],
    enabled,
    load: fetchSessionStats,
    mapError: () => "Couldn't load session stats.",
  })

  const tightness = useAsyncData<TightnessStatsResponse>({
    deps: [retryKey],
    enabled,
    load: fetchTightnessStats,
    mapError: () => "Couldn't load vote tightness.",
  })

  const defectors = useAsyncData<ChamberPair<DefectorEntry[]>>({
    deps: [retryKey],
    enabled,
    load: () =>
      bothChambers<DefectorEntry[]>(
        async (chamber) => (await fetchDefectors(chamber)).defectors,
        [],
        'Defectors unavailable',
      ),
    mapError: () => "Couldn't load defectors.",
  })

  const portfolios = useAsyncData<ChamberPair<PortfolioMovers>>({
    deps: [retryKey],
    enabled,
    load: () =>
      bothChambers<PortfolioMovers>(
        fetchPortfolioStats,
        {
          gainers: [],
          losers: [],
          disclaimer: 'Estimates from public disclosures.',
        },
        'Portfolio data unavailable',
      ),
    mapError: () => "Couldn't load portfolio stats.",
  })

  return {
    reload,
    session: withGateLoading(session, enabled),
    tightness: withGateLoading(tightness, enabled),
    defectors: withGateLoading(defectors, enabled),
    portfolios: withGateLoading(portfolios, enabled),
  }
}

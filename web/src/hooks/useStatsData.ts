import { useState } from 'react'

import {
  fetchDefectors,
  fetchPortfolioStats,
  fetchPulseStats,
  fetchSessionStats,
} from '../api/client'
import type {
  DefectorEntry,
  PortfolioMovers,
  PulseStatsResponse,
  SessionStatsResponse,
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

export function useStatsData() {
  const [retryKey, setRetryKey] = useState(0)

  const reload = () => setRetryKey((k) => k + 1)

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

  const defectors = useAsyncData<ChamberPair<DefectorEntry[]>>({
    deps: [retryKey],
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
    session,
    pulse,
    defectors,
    portfolios,
  }
}

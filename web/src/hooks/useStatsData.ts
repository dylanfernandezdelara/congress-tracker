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

  return {
    reload,
    session,
    pulse,
    defectors,
    portfolios,
  }
}

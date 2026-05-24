import { useEffect, useState } from 'react'
import { ApiError, fetchLatestBriefing, type BriefingFeedResponse } from '../api'
import { E2E_BRIEFING } from '../e2eData'
import { useE2eMode } from './useE2eMode'

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (HTTP ${error.status})`
  if (error instanceof Error) return error.message
  return 'Unexpected fetch error.'
}

export function useBriefingFeed(): {
  briefing: BriefingFeedResponse | null
  error: string | null
  isLoading: boolean
  usingDemo: boolean
} {
  const e2eMode = useE2eMode()
  const [briefing, setBriefing] = useState<BriefingFeedResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [usingDemo, setUsingDemo] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)
      setUsingDemo(false)

      if (e2eMode) {
        if (cancelled) return
        setBriefing(E2E_BRIEFING)
        setUsingDemo(true)
        setIsLoading(false)
        return
      }

      try {
        const result = await fetchLatestBriefing()
        if (cancelled) return
        setBriefing(result)
      } catch (err) {
        if (cancelled) return
        setBriefing(null)
        setError(`Live briefing unavailable. ${normalizeErrorMessage(err)}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [e2eMode])

  return { briefing, error, isLoading, usingDemo }
}

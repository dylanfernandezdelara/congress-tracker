import { useEffect, useState } from 'react'
import { fetchLatestBriefing, type BriefingFeedResponse } from '../api'
import { normalizeErrorMessage } from '../utils/errors'

export function useBriefingFeed(): {
  briefing: BriefingFeedResponse | null
  error: string | null
  isLoading: boolean
} {
  const [briefing, setBriefing] = useState<BriefingFeedResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)

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
  }, [])

  return { briefing, error, isLoading }
}

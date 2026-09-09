import { useEffect, useRef, type RefObject } from 'react'

import type { BillQuote } from '@congress-tracker/shared/share-api-types'

import type { FeedItem } from '../api/types'
import type { SummaryHighlight } from '../components/FeedSummarySections'
import { summaryContainsQuote } from '../components/FeedSummarySections'
import type { FeedSummaryContent } from '../utils/feedRowLabels'
import { useSharedQuote } from './useSharedQuote'

export const SHARED_QUOTE_TOAST = 'Shared quote'

export type SharedQuoteLanding = {
  /** Resolved quote for `?quote=`, once it belongs to this bill. */
  quote: BillQuote | null
  /** True when the quote can be marked inside the rendered summary. */
  inSummary: boolean
  /** Highlight to pass to `FeedSummarySections`; null shows the callout instead. */
  highlight: SummaryHighlight | null
}

/**
 * G2 landing behaviour for a shared quote: resolve the id, decide whether it
 * can be highlighted in place, then scroll the mark into view and notify once.
 */
export function useSharedQuoteLanding(params: {
  item: FeedItem
  quoteId: string | null | undefined
  summary: FeedSummaryContent
  containerRef: RefObject<HTMLElement | null>
  notify: (message: string) => void
}): SharedQuoteLanding {
  const { item, quoteId, summary, containerRef, notify } = params
  const shared = useSharedQuote(item, quoteId)
  const quote = shared.status === 'ready' ? shared.quote : null
  const inSummary = quote ? summaryContainsQuote(summary, quote.text) : false
  // Latest callback without making it an effect dependency: a new `notify`
  // identity must not re-toast an already-landed quote.
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  useEffect(() => {
    if (!quote) return
    notifyRef.current(SHARED_QUOTE_TOAST)
    if (!inSummary) return
    const frame = window.requestAnimationFrame(() => {
      const mark = containerRef.current?.querySelector<HTMLElement>('[data-quote-highlight]')
      mark?.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [quote, inSummary, containerRef])

  return {
    quote,
    inSummary,
    highlight: quote && inSummary ? { quote: quote.text, landing: true } : null,
  }
}

import { useEffect, useState } from 'react'

import { formatBillQueryParam, parseBillQueryParam } from '@congress-tracker/shared/bill-id'
import { quoteBelongsToBill } from '@congress-tracker/shared/quote-verification'
import type { BillQuote } from '@congress-tracker/shared/share-api-types'

import { fetchBillQuote } from '../api/client'
import type { FeedItem } from '../api/types'

export type SharedQuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; quote: BillQuote }
  | { status: 'missing' }

/**
 * Resolves `?quote=<id>` for the expanded bill. Quotes stored for a different
 * bill are treated as missing so a stale id cannot decorate the wrong row.
 */
export function useSharedQuote(
  item: Pick<FeedItem, 'bill'>,
  quoteId: string | null | undefined,
): SharedQuoteState {
  // Primitive dependency so a fresh `item` object does not refetch the quote.
  const billParam = formatBillQueryParam(item.bill)
  const [state, setState] = useState<SharedQuoteState>({ status: 'idle' })

  useEffect(() => {
    if (!quoteId) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    fetchBillQuote(quoteId)
      .then(({ quote }) => {
        if (cancelled) return
        const bill = parseBillQueryParam(billParam)
        const belongs = bill !== null && quoteBelongsToBill(quote, bill)
        setState(belongs ? { status: 'ready', quote } : { status: 'missing' })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'missing' })
      })
    return () => {
      cancelled = true
    }
  }, [quoteId, billParam])

  return state
}

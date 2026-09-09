import { useEffect, useState } from 'react'

import type { OgCardModel } from '@congress-tracker/shared/og-card'
import type { RollPartySplit } from '@congress-tracker/shared/stats-api-types'
import type { BillQuote } from '@congress-tracker/shared/share-api-types'

import type { FeedItem } from '../api/types'
import {
  buildBillQuoteSharePayload,
  buildBillSharePayload,
  copyTextToClipboard,
  shareBillViaNavigator,
  type BillSharePayload,
} from '../utils/billDeepLink'
import { buildOgCardModelFromFeedItem } from '../utils/ogCardModel'

const COPIED_MS = 2000

export type BillShareState = {
  open: boolean
  /** Bumps each time the sheet opens so `AnimatedSheet` replays its entrance. */
  selectionKey: number
  /** Quote being shared from the sheet; null shares the whole bill. */
  pendingQuote: BillQuote | null
  copied: boolean
  payload: BillSharePayload
  card: OgCardModel
  openSheet: (quote: BillQuote | null) => void
  closeSheet: () => void
  share: () => Promise<void>
  copyLink: () => Promise<void>
}

/**
 * Share-sheet state for one bill: what is being shared (bill or quote), the
 * payload and card preview for it, and the share / copy actions.
 */
export function useBillShare(
  item: FeedItem,
  options: { shareUrl?: string; partySplits: RollPartySplit[] },
): BillShareState {
  const [open, setOpen] = useState(false)
  const [selectionKey, setSelectionKey] = useState(0)
  const [pendingQuote, setPendingQuote] = useState<BillQuote | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  const payload = pendingQuote
    ? buildBillQuoteSharePayload(item, pendingQuote)
    : buildBillSharePayload(item, options.shareUrl)
  const card = buildOgCardModelFromFeedItem(item, {
    quote: pendingQuote?.text ?? null,
    partySplits: options.partySplits,
  })

  const copyLink = async () => {
    const ok = await copyTextToClipboard(payload.clipboardText)
    if (ok) setCopied(true)
  }

  const share = async () => {
    const result = await shareBillViaNavigator(payload)
    if (result === 'unavailable') await copyLink()
  }

  return {
    open,
    selectionKey,
    pendingQuote,
    copied,
    payload,
    card,
    openSheet: (quote) => {
      setPendingQuote(quote)
      setSelectionKey((key) => key + 1)
      setOpen(true)
    },
    closeSheet: () => setOpen(false),
    share,
    copyLink,
  }
}

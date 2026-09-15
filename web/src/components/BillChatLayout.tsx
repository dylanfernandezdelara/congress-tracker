import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { BillQuote } from '@congress-tracker/shared/share-api-types'

import type { FeedItem } from '../api/types'

/** Same breakpoint Home uses to mount the left/right rails. */
export const BILL_CHAT_DESKTOP_QUERY = '(min-width: 1024px)'
export const BILL_CHAT_RAIL_ID = 'bill-chat-rail'

/**
 * Vaul 1.1.2: numbers are viewport fractions (`0.5` = half the window).
 * Pixel snaps must be strings (`"180px"`). A bare `88` is 88× the viewport.
 * 180px covers the handle, title row, and a typical iOS home-indicator inset.
 */
export const BILL_CHAT_DRAWER_PEEK = '180px'
export const BILL_CHAT_DRAWER_HALF = 0.5
export const BILL_CHAT_DRAWER_FULL = 0.92

export const BILL_CHAT_DRAWER_SNAP_POINTS = [
  BILL_CHAT_DRAWER_PEEK,
  BILL_CHAT_DRAWER_HALF,
  BILL_CHAT_DRAWER_FULL,
] as const

export type BillChatDrawerSnap = 'peek' | 'half' | 'full'

export function billChatDrawerSnap(point: number | string | null): BillChatDrawerSnap {
  if (point === BILL_CHAT_DRAWER_HALF) return 'half'
  if (point === BILL_CHAT_DRAWER_FULL) return 'full'
  return 'peek'
}

export type BillChatSessionPayload = {
  item: FeedItem
  pendingSelection: string | null
  onClearSelection: () => void
  onSharePassage: (text: string) => void
  onQuoteCreated: (quote: BillQuote) => void
}

export type BillChatSession = BillChatSessionPayload & {
  sourceId: string
}

type BillChatActions = {
  attach: (sourceId: string) => () => void
  patch: (sourceId: string, payload: BillChatSessionPayload) => void
}

const BillChatActionsContext = createContext<BillChatActions | null>(null)
const BillChatSessionContext = createContext<BillChatSession | null>(null)

export function BillChatLayoutProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [payloads, setPayloads] = useState<Record<string, BillChatSessionPayload>>({})
  const sourcesRef = useRef<string[]>([])

  const attach = useCallback((sourceId: string) => {
    sourcesRef.current = [...sourcesRef.current.filter((id) => id !== sourceId), sourceId]
    setActiveId(sourceId)
    return () => {
      sourcesRef.current = sourcesRef.current.filter((id) => id !== sourceId)
      setPayloads((current) => {
        if (!(sourceId in current)) return current
        const next = { ...current }
        delete next[sourceId]
        return next
      })
      setActiveId((current) => {
        if (current !== sourceId) return current
        const remaining = sourcesRef.current
        return remaining[remaining.length - 1] ?? null
      })
    }
  }, [])

  const patch = useCallback((sourceId: string, payload: BillChatSessionPayload) => {
    setPayloads((current) => ({ ...current, [sourceId]: payload }))
  }, [])

  const actions = useMemo(() => ({ attach, patch }), [attach, patch])
  const payload = activeId ? payloads[activeId] : undefined
  const session = activeId && payload ? { sourceId: activeId, ...payload } : null

  return (
    <BillChatActionsContext.Provider value={actions}>
      <BillChatSessionContext.Provider value={session}>{children}</BillChatSessionContext.Provider>
    </BillChatActionsContext.Provider>
  )
}

export function useBillChatSession(): BillChatSession | null {
  return useContext(BillChatSessionContext)
}

export function useBillChatLayout(): (BillChatActions & { session: BillChatSession | null }) | null {
  const actions = useContext(BillChatActionsContext)
  const session = useContext(BillChatSessionContext)
  if (!actions) return null
  return { ...actions, session }
}

/** An expanded bill detail registers as the (single) chat source. Last attach wins; detach reclaims. */
export function usePresentBillChat(payload: BillChatSessionPayload | null): void {
  const actions = useContext(BillChatActionsContext)
  const sourceId = useId()
  const payloadRef = useRef(payload)
  payloadRef.current = payload
  const hasPayload = payload != null
  const item = payload?.item
  const pendingSelection = payload?.pendingSelection ?? null

  useLayoutEffect(() => {
    if (!actions || !hasPayload) return
    return actions.attach(sourceId)
  }, [actions, hasPayload, sourceId])

  useLayoutEffect(() => {
    const current = payloadRef.current
    if (!actions || !current) return
    actions.patch(sourceId, {
      item: current.item,
      pendingSelection: current.pendingSelection,
      onClearSelection: () => {
        payloadRef.current?.onClearSelection()
      },
      onSharePassage: (text) => {
        payloadRef.current?.onSharePassage(text)
      },
      onQuoteCreated: (quote) => {
        payloadRef.current?.onQuoteCreated(quote)
      },
    })
  }, [actions, item, pendingSelection, sourceId])
}

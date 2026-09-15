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
 * Keep `--bill-chat-peek` in bill-chat.css equal to this string.
 */
export const BILL_CHAT_DRAWER_PEEK = '180px'
export const BILL_CHAT_DRAWER_HALF = 0.5
/** Leaves the 48px header + notch above the handle so handleOnly can still drag. */
export const BILL_CHAT_DRAWER_FULL = 0.85

export const BILL_CHAT_DRAWER_SNAP_POINTS = [
  BILL_CHAT_DRAWER_PEEK,
  BILL_CHAT_DRAWER_HALF,
  BILL_CHAT_DRAWER_FULL,
] as const

export type BillChatDrawerSnap = 'peek' | 'half' | 'full'

export function billChatDrawerSnap(point: number | string | null): BillChatDrawerSnap {
  switch (point) {
    case BILL_CHAT_DRAWER_HALF:
      return 'half'
    case BILL_CHAT_DRAWER_FULL:
      return 'full'
    case BILL_CHAT_DRAWER_PEEK:
    case null:
      return 'peek'
    default:
      // Vaul emits intermediate values while dragging; do not throw.
      return 'peek'
  }
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

type SourceRecord = {
  sourceId: string
  item: FeedItem
  pendingSelection: string | null
}

type SessionHandlers = Pick<
  BillChatSessionPayload,
  'onClearSelection' | 'onSharePassage' | 'onQuoteCreated'
>

type BillChatActions = {
  present: (sourceId: string, payload: BillChatSessionPayload, activate: boolean) => void
  reclaim: (sourceId: string) => void
}

const BillChatActionsContext = createContext<BillChatActions | null>(null)
const BillChatSessionContext = createContext<BillChatSession | null>(null)

export function BillChatLayoutProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<SourceRecord[]>([])
  const handlersRef = useRef<Record<string, SessionHandlers>>({})

  const present = useCallback((sourceId: string, payload: BillChatSessionPayload, activate: boolean) => {
    handlersRef.current[sourceId] = {
      onClearSelection: payload.onClearSelection,
      onSharePassage: payload.onSharePassage,
      onQuoteCreated: payload.onQuoteCreated,
    }
    const record: SourceRecord = {
      sourceId,
      item: payload.item,
      pendingSelection: payload.pendingSelection,
    }
    setStack((current) => {
      const exists = current.some((entry) => entry.sourceId === sourceId)
      if (!exists) return [...current, record]
      if (activate) {
        return [...current.filter((entry) => entry.sourceId !== sourceId), record]
      }
      return current.map((entry) => (entry.sourceId === sourceId ? record : entry))
    })
  }, [])

  const reclaim = useCallback((sourceId: string) => {
    delete handlersRef.current[sourceId]
    setStack((current) => current.filter((entry) => entry.sourceId !== sourceId))
  }, [])

  const actions = useMemo(() => ({ present, reclaim }), [present, reclaim])
  const active = stack[stack.length - 1] ?? null
  const session = useMemo((): BillChatSession | null => {
    if (!active) return null
    return {
      sourceId: active.sourceId,
      item: active.item,
      pendingSelection: active.pendingSelection,
      onClearSelection: () => {
        handlersRef.current[active.sourceId]?.onClearSelection()
      },
      onSharePassage: (text) => {
        handlersRef.current[active.sourceId]?.onSharePassage(text)
      },
      onQuoteCreated: (quote) => {
        handlersRef.current[active.sourceId]?.onQuoteCreated(quote)
      },
    }
  }, [active])

  return (
    <BillChatActionsContext.Provider value={actions}>
      <BillChatSessionContext.Provider value={session}>{children}</BillChatSessionContext.Provider>
    </BillChatActionsContext.Provider>
  )
}

export function useBillChatSession(): BillChatSession | null {
  return useContext(BillChatSessionContext)
}

/**
 * An expanded bill detail registers as a chat source.
 * First present / Ask-about-this (`pendingSelection`) activates; detach reclaims.
 */
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
    return () => {
      actions.reclaim(sourceId)
    }
  }, [actions, hasPayload, sourceId])

  useLayoutEffect(() => {
    const current = payloadRef.current
    if (!actions || !current) return
    actions.present(sourceId, current, Boolean(current.pendingSelection))
  }, [actions, item, pendingSelection, sourceId])
}

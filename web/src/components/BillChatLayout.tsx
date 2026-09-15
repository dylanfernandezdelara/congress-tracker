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
  /** Increments on each Ask so a repeated passage still lifts the drawer. */
  askNonce: number
  onClearSelection: () => void
  onSharePassage: (text: string) => void
  onQuoteCreated: (quote: BillQuote) => void
}

export type BillChatSession = Omit<BillChatSessionPayload, 'askNonce'> & {
  sourceId: string
  askNonce: number
}

type SourceRecord = {
  sourceId: string
  item: FeedItem
  pendingSelection: string | null
  askNonce: number
}

type SessionHandlers = Pick<
  BillChatSessionPayload,
  'onClearSelection' | 'onSharePassage' | 'onQuoteCreated'
>

type OccupancyRecord = {
  item: FeedItem
  pendingSelection: string | null
  askNonce: number
}

type BillChatActions = {
  present: (sourceId: string, record: OccupancyRecord, activate: boolean) => void
  bindHandlers: (sourceId: string, handlers: SessionHandlers) => void
  reclaim: (sourceId: string) => void
}

const BillChatActionsContext = createContext<BillChatActions | null>(null)
const BillChatSessionContext = createContext<BillChatSession | null>(null)

export function BillChatLayoutProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<SourceRecord[]>([])
  const handlersRef = useRef<Record<string, SessionHandlers>>({})

  const present = useCallback((sourceId: string, record: OccupancyRecord, activate: boolean) => {
    const next: SourceRecord = {
      sourceId,
      item: record.item,
      pendingSelection: record.pendingSelection,
      askNonce: record.askNonce,
    }
    setStack((current) => {
      const exists = current.some((entry) => entry.sourceId === sourceId)
      if (!exists) return [...current, next]
      if (activate) {
        return [...current.filter((entry) => entry.sourceId !== sourceId), next]
      }
      return current.map((entry) => (entry.sourceId === sourceId ? next : entry))
    })
  }, [])

  const bindHandlers = useCallback((sourceId: string, handlers: SessionHandlers) => {
    handlersRef.current[sourceId] = handlers
  }, [])

  const reclaim = useCallback((sourceId: string) => {
    delete handlersRef.current[sourceId]
    setStack((current) => current.filter((entry) => entry.sourceId !== sourceId))
  }, [])

  const actions = useMemo(() => ({ present, bindHandlers, reclaim }), [present, bindHandlers, reclaim])
  const active = stack[stack.length - 1] ?? null
  const session = useMemo((): BillChatSession | null => {
    if (!active) return null
    return {
      sourceId: active.sourceId,
      item: active.item,
      pendingSelection: active.pendingSelection,
      askNonce: active.askNonce,
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
 * First present appends. Ask (`askNonce` bump) steals. A leftover chip does not.
 * Detach reclaims.
 */
export function usePresentBillChat(payload: BillChatSessionPayload | null): void {
  const actions = useContext(BillChatActionsContext)
  const sourceId = useId()
  const payloadRef = useRef(payload)
  payloadRef.current = payload
  const seenAskNonce = useRef<number | null>(null)
  const hasPayload = payload != null
  const item = payload?.item
  const pendingSelection = payload?.pendingSelection ?? null
  const askNonce = payload?.askNonce

  useLayoutEffect(() => {
    if (!actions || !hasPayload) return
    return () => {
      seenAskNonce.current = null
      actions.reclaim(sourceId)
    }
  }, [actions, hasPayload, sourceId])

  useLayoutEffect(() => {
    const current = payloadRef.current
    if (!actions || !current) return
    const nonce = current.askNonce
    const activate = seenAskNonce.current !== null && nonce !== seenAskNonce.current
    seenAskNonce.current = nonce
    actions.present(
      sourceId,
      {
        item: current.item,
        pendingSelection: current.pendingSelection,
        askNonce: nonce,
      },
      activate,
    )
  }, [actions, item, pendingSelection, askNonce, sourceId])

  // Handlers can change without an occupancy change; keep the ref current every commit.
  useLayoutEffect(() => {
    const current = payloadRef.current
    if (!actions || !current) return
    actions.bindHandlers(sourceId, {
      onClearSelection: current.onClearSelection,
      onSharePassage: current.onSharePassage,
      onQuoteCreated: current.onQuoteCreated,
    })
  })
}

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

import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'
import type { BillQuote } from '@congress-tracker/shared/share-api-types'

import type { FeedItem } from '../api/types'
import type { BillChatSectionProps } from './BillChatSection'

export const BILL_CHAT_RAIL_ID = 'bill-chat-rail'

type SourceHandlers = {
  onSharePassage: (text: string) => void
  onQuoteCreated: (quote: BillQuote) => void
}

/** What an expanded bill detail contributes to the shared chat. */
export type BillChatSource = SourceHandlers & { item: FeedItem }

/** What the rail or drawer renders: the chat's props plus identity. */
export type BillChatSession = {
  sourceId: string
  billId: string
  /** Times the reader used "Ask about this" on this source; the drawer lifts when it grows. */
  asks: number
  chat: BillChatSectionProps
}

type SourceRecord = {
  sourceId: string
  item: FeedItem
  pendingSelection: string | null
  asks: number
}

type BillChatActions = {
  present: (sourceId: string, item: FeedItem) => void
  ask: (sourceId: string, text: string) => void
  clearSelection: (sourceId: string) => void
  bindHandlers: (sourceId: string, handlers: SourceHandlers) => void
  reclaim: (sourceId: string) => void
}

const BillChatActionsContext = createContext<BillChatActions | null>(null)
const BillChatSessionContext = createContext<BillChatSession | null>(null)

/**
 * One chat surface for the page. Expanded bills register as sources; the
 * newest registration is shown, and "Ask about this" from any source brings
 * that source forward. Handlers live in a ref so a re-rendered detail panel
 * never restacks the occupant.
 */
export function BillChatLayoutProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<SourceRecord[]>([])
  const handlersRef = useRef<Record<string, SourceHandlers>>({})

  const present = useCallback((sourceId: string, item: FeedItem) => {
    setStack((current) => {
      const existing = current.find((entry) => entry.sourceId === sourceId)
      if (!existing) return [...current, { sourceId, item, pendingSelection: null, asks: 0 }]
      return current.map((entry) => (entry === existing ? { ...entry, item } : entry))
    })
  }, [])

  const ask = useCallback((sourceId: string, text: string) => {
    setStack((current) => {
      const existing = current.find((entry) => entry.sourceId === sourceId)
      if (!existing) return current
      const asked = { ...existing, pendingSelection: text, asks: existing.asks + 1 }
      return [...current.filter((entry) => entry !== existing), asked]
    })
  }, [])

  const clearSelection = useCallback((sourceId: string) => {
    setStack((current) =>
      current.map((entry) =>
        entry.sourceId === sourceId && entry.pendingSelection !== null
          ? { ...entry, pendingSelection: null }
          : entry,
      ),
    )
  }, [])

  const bindHandlers = useCallback((sourceId: string, handlers: SourceHandlers) => {
    handlersRef.current[sourceId] = handlers
  }, [])

  const reclaim = useCallback((sourceId: string) => {
    delete handlersRef.current[sourceId]
    setStack((current) => current.filter((entry) => entry.sourceId !== sourceId))
  }, [])

  const actions = useMemo(
    () => ({ present, ask, clearSelection, bindHandlers, reclaim }),
    [present, ask, clearSelection, bindHandlers, reclaim],
  )
  const active = stack[stack.length - 1] ?? null
  const session = useMemo((): BillChatSession | null => {
    if (!active) return null
    const { sourceId } = active
    return {
      sourceId,
      billId: formatBillQueryParam(active.item.bill),
      asks: active.asks,
      chat: {
        item: active.item,
        pendingSelection: active.pendingSelection,
        onClearSelection: () => clearSelection(sourceId),
        onSharePassage: (text) => handlersRef.current[sourceId]?.onSharePassage(text),
        onQuoteCreated: (quote) => handlersRef.current[sourceId]?.onQuoteCreated(quote),
      },
    }
  }, [active, clearSelection])

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
 * Register an expanded bill as a chat source while `source` is non-null and
 * get back its "Ask about this" action. Without a provider (isolated detail
 * tests) registration and the action are no-ops.
 */
export function usePresentBillChat(source: BillChatSource | null): (text: string) => void {
  const actions = useContext(BillChatActionsContext)
  const sourceId = useId()
  const sourceRef = useRef(source)
  sourceRef.current = source
  const item = source?.item ?? null
  const hasItem = item !== null

  useLayoutEffect(() => {
    if (!actions || !hasItem) return
    return () => actions.reclaim(sourceId)
  }, [actions, hasItem, sourceId])

  useLayoutEffect(() => {
    if (!actions || !item) return
    actions.present(sourceId, item)
  }, [actions, item, sourceId])

  // Handlers can change without a stack write; keep the ref current every commit.
  useLayoutEffect(() => {
    const current = sourceRef.current
    if (!actions || !current) return
    actions.bindHandlers(sourceId, {
      onSharePassage: current.onSharePassage,
      onQuoteCreated: current.onQuoteCreated,
    })
  })

  return useCallback(
    (text: string) => {
      actions?.ask(sourceId, text)
    },
    [actions, sourceId],
  )
}

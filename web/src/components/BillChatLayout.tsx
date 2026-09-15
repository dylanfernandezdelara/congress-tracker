import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export const BILL_CHAT_RAIL_ID = 'bill-chat-rail'
export const BILL_CHAT_DESKTOP_QUERY = '(min-width: 1024px)'
export const BILL_CHAT_MOBILE_QUERY = '(max-width: 1023px)'

/**
 * Vaul 1.1.2: numbers are viewport fractions (`0.5` = half the window).
 * Pixel snaps must be strings (`"140px"`). A bare `88` is 88× the viewport.
 */
export const BILL_CHAT_DRAWER_PEEK = '140px'
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

type BillChatLayoutValue = {
  activeKey: string | null
  railOccupied: boolean
  occupyRail: (key: string) => () => void
}

const BillChatLayoutContext = createContext<BillChatLayoutValue | null>(null)

export function BillChatLayoutProvider({ children }: { children: ReactNode }) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const occupyRail = useCallback((key: string) => {
    setActiveKey(key)
    return () => {
      setActiveKey((current) => (current === key ? null : current))
    }
  }, [])
  const value = useMemo(
    () => ({ activeKey, railOccupied: activeKey != null, occupyRail }),
    [activeKey, occupyRail],
  )
  return <BillChatLayoutContext.Provider value={value}>{children}</BillChatLayoutContext.Provider>
}

export function useBillChatLayout(): BillChatLayoutValue | null {
  return useContext(BillChatLayoutContext)
}

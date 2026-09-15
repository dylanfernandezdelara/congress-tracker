import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'
import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { BillQuote } from '@congress-tracker/shared/share-api-types'

import type { FeedItem } from '../api/types'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { BillChatSection } from './BillChatSection'
import {
  BILL_CHAT_DESKTOP_QUERY,
  BILL_CHAT_DRAWER_HALF,
  BILL_CHAT_DRAWER_PEEK,
  BILL_CHAT_DRAWER_SNAP_POINTS,
  BILL_CHAT_MOBILE_QUERY,
  BILL_CHAT_RAIL_ID,
  billChatDrawerSnap,
  useBillChatLayout,
} from './BillChatLayout'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from './ui/drawer'

type BillChatDockProps = {
  item: FeedItem
  pendingSelection?: string | null
  onClearSelection?: () => void
  onSharePassage: (text: string) => void
  onQuoteCreated: (quote: BillQuote) => void
}

export function BillChatDock({
  item,
  pendingSelection = null,
  onClearSelection,
  onSharePassage,
  onQuoteCreated,
}: BillChatDockProps) {
  const isDesktop = useMediaQuery(BILL_CHAT_DESKTOP_QUERY)
  const isMobile = useMediaQuery(BILL_CHAT_MOBILE_QUERY)
  const layout = useBillChatLayout()
  const billKey = formatBillQueryParam(item.bill)
  const [snapPoint, setSnapPoint] = useState<number | string | null>(BILL_CHAT_DRAWER_PEEK)
  const snap = billChatDrawerSnap(snapPoint)

  useLayoutEffect(() => {
    if (!layout) return
    return layout.occupyRail(billKey)
  }, [billKey, layout])

  const isActive = Boolean(layout && layout.activeKey === billKey)

  useEffect(() => {
    if (!pendingSelection || !isMobile || !isActive) return
    setSnapPoint(BILL_CHAT_DRAWER_HALF)
  }, [isActive, isMobile, pendingSelection])

  const chat = (
    <BillChatSection
      item={item}
      pendingSelection={pendingSelection}
      onClearSelection={onClearSelection}
      onSharePassage={onSharePassage}
      onQuoteCreated={onQuoteCreated}
      onOpenFromPeek={
        isMobile && snap === 'peek' ? () => setSnapPoint(BILL_CHAT_DRAWER_HALF) : undefined
      }
    />
  )

  const railEl = typeof document === 'undefined' ? null : document.getElementById(BILL_CHAT_RAIL_ID)
  const ownsRail = Boolean(isDesktop && isActive && railEl)

  if (ownsRail && railEl) {
    return createPortal(
      <div className="bill-chat-dock bill-chat-dock--rail">{chat}</div>,
      railEl,
    )
  }

  if (isMobile && isActive) {
    return (
      <Drawer
        open
        modal={false}
        dismissible={false}
        handleOnly
        noBodyStyles
        shouldScaleBackground={false}
        snapPoints={[...BILL_CHAT_DRAWER_SNAP_POINTS]}
        activeSnapPoint={snapPoint}
        setActiveSnapPoint={setSnapPoint}
      >
        <DrawerContent showOverlay={false} className="bill-chat-drawer h-full max-h-[97%] mt-0">
          <DrawerTitle className="sr-only">Ask about this bill</DrawerTitle>
          <DrawerDescription className="sr-only">
            Pull up to ask follow-up questions without leaving the bill.
          </DrawerDescription>
          <div className="bill-chat-drawer-inner" data-snap={snap}>
            {chat}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  if (layout && (isDesktop || isMobile)) {
    return null
  }

  return <div className="bill-chat-dock bill-chat-dock--inline">{chat}</div>
}

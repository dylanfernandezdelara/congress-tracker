import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { BillChatSection } from './BillChatSection'
import {
  BILL_CHAT_DRAWER_HALF,
  BILL_CHAT_DRAWER_PEEK,
  BILL_CHAT_DRAWER_SNAP_POINTS,
  BILL_CHAT_RAIL_ID,
  billChatDrawerSnap,
  useBillChatSession,
} from './BillChatLayout'
import { Button } from './ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from './ui/drawer'

export type BillChatDockPlacement = 'rail' | 'drawer' | 'inline'

type BillChatDockProps = {
  isDesktop?: boolean
  /** Isolated tests render in place so they do not mount a vaul dialog. */
  placement?: BillChatDockPlacement
}

export function BillChatDock({ isDesktop = false, placement }: BillChatDockProps) {
  const session = useBillChatSession()
  const mode = placement ?? (isDesktop ? 'rail' : 'drawer')
  const [snapPoint, setSnapPoint] = useState<number | string | null>(BILL_CHAT_DRAWER_PEEK)
  const snap = billChatDrawerSnap(snapPoint)
  const billId = session ? formatBillQueryParam(session.item.bill) : null

  useEffect(() => {
    setSnapPoint(BILL_CHAT_DRAWER_PEEK)
  }, [session?.sourceId])

  useEffect(() => {
    if (!session?.pendingSelection || mode !== 'drawer') return
    setSnapPoint(BILL_CHAT_DRAWER_HALF)
  }, [mode, session?.pendingSelection])

  if (!session || !billId) return null

  const collapsed = mode === 'drawer' && snap === 'peek'
  const drawerActions =
    mode === 'drawer' ? (
      snap === 'peek' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="bill-chat-open-peek"
          onClick={() => setSnapPoint(BILL_CHAT_DRAWER_HALF)}
        >
          Open
          <ChevronUpIcon />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="bill-chat-minimize"
          onClick={() => setSnapPoint(BILL_CHAT_DRAWER_PEEK)}
        >
          Minimize
          <ChevronDownIcon />
        </Button>
      )
    ) : null

  const chat = (
    <BillChatSection
      item={session.item}
      pendingSelection={session.pendingSelection}
      onClearSelection={session.onClearSelection}
      onSharePassage={session.onSharePassage}
      onQuoteCreated={session.onQuoteCreated}
      collapsed={collapsed}
      headerActions={drawerActions}
    />
  )

  if (mode === 'rail') {
    return (
      <div
        id={BILL_CHAT_RAIL_ID}
        className="bill-chat-dock bill-chat-dock--rail bill-chat-rail"
        data-bill={billId}
      >
        {chat}
      </div>
    )
  }

  if (mode === 'inline') {
    return (
      <div className="bill-chat-dock bill-chat-dock--inline" data-bill={billId}>
        {chat}
      </div>
    )
  }

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
        <div className="bill-chat-drawer-inner" data-snap={snap} data-bill={billId}>
          {chat}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

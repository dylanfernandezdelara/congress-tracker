import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { BillChatDrawer } from './BillChatDrawer'
import { BillChatSection } from './BillChatSection'
import {
  BILL_CHAT_DRAWER_HALF,
  BILL_CHAT_DRAWER_PEEK,
  BILL_CHAT_RAIL_ID,
  billChatDrawerSnap,
  useBillChatSession,
} from './BillChatLayout'
import { Button } from './ui/button'

export type BillChatDockPlacement = 'rail' | 'drawer' | 'inline'

type BillChatDockProps = {
  placement: BillChatDockPlacement
}

export function BillChatDock({ placement }: BillChatDockProps) {
  const session = useBillChatSession()
  const [snapPoint, setSnapPoint] = useState<number | string | null>(BILL_CHAT_DRAWER_PEEK)
  const snap = billChatDrawerSnap(snapPoint)
  const billId = session ? formatBillQueryParam(session.item.bill) : null

  useEffect(() => {
    setSnapPoint(BILL_CHAT_DRAWER_PEEK)
  }, [session?.sourceId])

  useEffect(() => {
    if (!session?.pendingSelection || placement !== 'drawer') return
    setSnapPoint(BILL_CHAT_DRAWER_HALF)
  }, [placement, session?.pendingSelection])

  if (!session || !billId) return null

  const collapsed = placement === 'drawer' && snap === 'peek'
  const drawerActions =
    placement === 'drawer' ? (
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

  if (placement === 'rail') {
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

  if (placement === 'inline') {
    return (
      <div className="bill-chat-dock bill-chat-dock--inline" data-bill={billId}>
        {chat}
      </div>
    )
  }

  return (
    <BillChatDrawer snapPoint={snapPoint} setSnapPoint={setSnapPoint} snap={snap} billId={billId}>
      {chat}
    </BillChatDrawer>
  )
}

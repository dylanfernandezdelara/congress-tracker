import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'

import { BillChatDrawer } from './BillChatDrawer'
import { BILL_CHAT_RAIL_ID, useBillChatSession } from './BillChatLayout'
import { BillChatPane } from './BillChatPane'

export type BillChatDockPlacement = 'rail' | 'drawer'

type BillChatDockProps = {
  placement: BillChatDockPlacement
}

export function BillChatDock({ placement }: BillChatDockProps) {
  const session = useBillChatSession()
  const billId = session ? formatBillQueryParam(session.item.bill) : null

  if (!session || !billId) return null

  switch (placement) {
    case 'rail':
      return (
        <div
          id={BILL_CHAT_RAIL_ID}
          className="bill-chat-dock bill-chat-dock--rail bill-chat-rail"
          data-bill={billId}
        >
          <BillChatPane />
        </div>
      )
    case 'drawer':
      return <BillChatDrawer billId={billId} />
    default: {
      const _exhaustive: never = placement
      return _exhaustive
    }
  }
}

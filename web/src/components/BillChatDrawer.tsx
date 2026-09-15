import type { ReactNode } from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'

import {
  BILL_CHAT_DRAWER_SNAP_POINTS,
  type BillChatDrawerSnap,
} from './BillChatLayout'
import { Drawer, DrawerDescription, DrawerHandle, DrawerTitle } from './ui/drawer'

type BillChatDrawerProps = {
  snapPoint: number | string | null
  setSnapPoint: (point: number | string | null) => void
  snap: BillChatDrawerSnap
  billId: string
  children: ReactNode
}

/** Non-modal vaul companion: no overlay, no body lock, handle-only drag. */
export function BillChatDrawer({
  snapPoint,
  setSnapPoint,
  snap,
  billId,
  children,
}: BillChatDrawerProps) {
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
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content className="bill-chat-drawer fixed inset-x-0 bottom-0 z-30 mt-0 flex h-full max-h-[97%] flex-col rounded-t-[10px] border bg-background">
          <DrawerHandle />
          <DrawerTitle className="sr-only">Ask about this bill</DrawerTitle>
          <DrawerDescription className="sr-only">
            Pull up to ask follow-up questions without leaving the bill.
          </DrawerDescription>
          <div className="bill-chat-drawer-inner" data-snap={snap} data-bill={billId}>
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </Drawer>
  )
}

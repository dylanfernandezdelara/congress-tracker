import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'

import { BillChatPane } from './BillChatPane'
import {
  BILL_CHAT_DRAWER_HALF,
  BILL_CHAT_DRAWER_PEEK,
  BILL_CHAT_DRAWER_SNAP_POINTS,
  billChatDrawerSnap,
  useBillChatSession,
} from './BillChatLayout'
import { Button } from './ui/button'
import { Drawer, DrawerDescription, DrawerHandle, DrawerTitle } from './ui/drawer'

/** Visible slice of a bottom vaul sheet: viewport minus the translated top. */
export function billChatVisibleSlicePx(sheetTop: number, viewportHeight: number): number {
  if (!Number.isFinite(sheetTop) || !Number.isFinite(viewportHeight)) return 0
  return Math.max(0, viewportHeight - sheetTop)
}

export function syncBillChatDrawerSnapHeight(drawer: HTMLElement): void {
  const snap = drawer.querySelector(':scope > .bill-chat-drawer-snap')
  if (!(snap instanceof HTMLElement)) return
  snap.style.height = `${billChatVisibleSlicePx(drawer.getBoundingClientRect().top, window.innerHeight)}px`
}

function useBillChatDrawerSnapHeight() {
  const cleanupRef = useRef<(() => void) | null>(null)
  return useCallback((node: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!node) return
    const sync = () => syncBillChatDrawerSnapHeight(node)
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(node, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', sync)
    const raf = requestAnimationFrame(sync)
    cleanupRef.current = () => {
      mo.disconnect()
      window.removeEventListener('resize', sync)
      cancelAnimationFrame(raf)
    }
  }, [])
}

/** Non-modal vaul companion: no overlay, no body lock, handle-only drag. */
export function BillChatDrawer({ billId }: { billId: string }) {
  const session = useBillChatSession()
  const drawerRef = useBillChatDrawerSnapHeight()
  const [snapPoint, setSnapPoint] = useState<number | string | null>(BILL_CHAT_DRAWER_PEEK)
  const snap = billChatDrawerSnap(snapPoint)
  const collapsed = snap === 'peek'

  useEffect(() => {
    setSnapPoint(BILL_CHAT_DRAWER_PEEK)
  }, [session?.sourceId])

  useEffect(() => {
    if (!session?.pendingSelection) return
    setSnapPoint((current) =>
      billChatDrawerSnap(current) === 'peek' ? BILL_CHAT_DRAWER_HALF : current,
    )
  }, [session?.askNonce, session?.pendingSelection, session?.sourceId])

  const headerActions =
    snap === 'peek' ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="bill-chat-open-peek"
        aria-expanded={false}
        onClick={() => setSnapPoint(BILL_CHAT_DRAWER_HALF)}
      >
        Open chat
        <ChevronUpIcon />
      </Button>
    ) : (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="bill-chat-minimize"
        aria-expanded={true}
        onClick={() => setSnapPoint(BILL_CHAT_DRAWER_PEEK)}
      >
        Minimize
        <ChevronDownIcon />
      </Button>
    )

  return (
    <Drawer
      open
      modal={false}
      dismissible={false}
      handleOnly
      noBodyStyles
      shouldScaleBackground={false}
      repositionInputs={false}
      snapPoints={[...BILL_CHAT_DRAWER_SNAP_POINTS]}
      activeSnapPoint={snapPoint}
      setActiveSnapPoint={setSnapPoint}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content
          ref={drawerRef}
          className="bill-chat-drawer fixed inset-x-0 bottom-0 z-30 mt-0 flex h-full max-h-[97%] flex-col rounded-t-[10px] border bg-background"
        >
          <div className="bill-chat-drawer-snap">
            <DrawerHandle />
            <DrawerTitle className="sr-only">Ask about this bill</DrawerTitle>
            <DrawerDescription className="sr-only">
              Pull up to ask follow-up questions without leaving the bill.
            </DrawerDescription>
            <div className="bill-chat-drawer-inner" data-bill={billId}>
              <BillChatPane collapsed={collapsed} headerActions={headerActions} />
            </div>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </Drawer>
  )
}

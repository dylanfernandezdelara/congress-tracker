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

/** Vaul's `[data-vaul-drawer]` transform transition. Measure until it ends. */
export const BILL_CHAT_DRAWER_TRANSITION_MS = 500

function useBillChatDrawerSnapHeight(snapPoint: number | string | null) {
  const remasureRef = useRef<() => void>(() => {})
  const cleanupRef = useRef<(() => void) | null>(null)

  const bind = useCallback((node: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    remasureRef.current = () => {}
    if (!node) return

    let raf = 0
    const sync = () => syncBillChatDrawerSnapHeight(node)
    const remasureUntilSettled = () => {
      cancelAnimationFrame(raf)
      const deadline = performance.now() + BILL_CHAT_DRAWER_TRANSITION_MS
      const tick = (now: number) => {
        sync()
        if (now < deadline) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    remasureRef.current = remasureUntilSettled
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(node, { attributes: true, attributeFilter: ['style'] })
    const onTransition = (event: TransitionEvent) => {
      if (event.target !== node) return
      if (event.propertyName && event.propertyName !== 'transform') return
      if (event.type === 'transitionrun') remasureUntilSettled()
      else sync()
    }
    node.addEventListener('transitionrun', onTransition)
    node.addEventListener('transitionend', onTransition)
    window.addEventListener('resize', sync)
    cleanupRef.current = () => {
      cancelAnimationFrame(raf)
      remasureRef.current = () => {}
      mo.disconnect()
      node.removeEventListener('transitionrun', onTransition)
      node.removeEventListener('transitionend', onTransition)
      window.removeEventListener('resize', sync)
    }
  }, [])

  useEffect(() => {
    remasureRef.current()
  }, [snapPoint])

  return bind
}

/** Non-modal vaul companion: no overlay, no body lock, handle-only drag. */
export function BillChatDrawer({ billId }: { billId: string }) {
  const session = useBillChatSession()
  const [snapPoint, setSnapPoint] = useState<number | string | null>(BILL_CHAT_DRAWER_PEEK)
  const drawerRef = useBillChatDrawerSnapHeight(snapPoint)
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
            <div className="bill-chat-drawer-inner" data-bill={billId} data-snap={snap}>
              <BillChatPane collapsed={collapsed} headerActions={headerActions} />
            </div>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </Drawer>
  )
}

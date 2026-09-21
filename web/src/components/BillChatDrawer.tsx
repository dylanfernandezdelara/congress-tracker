import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'

import { useBillChatDrawerSnapHeight } from '../hooks/useBillChatDrawerSnapHeight'
import { closeTopSheet } from '../utils/sheetLayer'
import { useBillChatSession } from './BillChatLayout'
import { BillChatSection } from './BillChatSection'
import { Button } from './ui/button'
import { Drawer, DrawerDescription, DrawerHandle, DrawerTitle } from './ui/drawer'

/**
 * Vaul 1.1.2: numbers are viewport fractions (`0.5` = half the window).
 * Pixel snaps must be strings (`"128px"`). A bare `88` is 88× the viewport.
 * Keep `--bill-chat-peek` in bill-chat.css equal to this string. The sheet is
 * `max-h-[97%]`, so the visible peek is this minus 3% of the viewport
 * (~103px on an 844px phone): handle, title row, and the 16px inset.
 */
export const BILL_CHAT_DRAWER_PEEK = '128px'
export const BILL_CHAT_DRAWER_HALF = 0.5
/** Leaves the 48px header + notch above the handle so handleOnly can still drag. */
export const BILL_CHAT_DRAWER_FULL = 0.85

const SNAP_POINTS = [BILL_CHAT_DRAWER_PEEK, BILL_CHAT_DRAWER_HALF, BILL_CHAT_DRAWER_FULL]

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
      // Unknown values stay peek so a bad snap never throws.
      return 'peek'
  }
}

/**
 * Mobile companion to the expanded bill: a non-modal vaul sheet (no overlay,
 * no body lock, handle-only drag) that peeks as a title bar and lifts to half
 * or full. Renders nothing until a bill presents a chat session.
 */
export function BillChatDrawer() {
  const session = useBillChatSession()
  const [snapPoint, setSnapPoint] = useState<number | string | null>(BILL_CHAT_DRAWER_PEEK)
  const drawerRef = useBillChatDrawerSnapHeight(snapPoint)
  const snap = billChatDrawerSnap(snapPoint)
  const sourceId = session?.sourceId
  const asks = session?.asks ?? 0

  // A freshly presented bill starts peeked. Each "Ask about this" (a new
  // source or the same one again) lifts a peeked drawer to half and leaves a
  // half or full one where the reader put it.
  useEffect(() => {
    if (asks === 0) {
      setSnapPoint(BILL_CHAT_DRAWER_PEEK)
      return
    }
    setSnapPoint((current) =>
      billChatDrawerSnap(current) === 'peek' ? BILL_CHAT_DRAWER_HALF : current,
    )
  }, [sourceId, asks])

  if (!session) return null

  return (
    <Drawer
      open
      modal={false}
      dismissible={false}
      handleOnly
      noBodyStyles
      shouldScaleBackground={false}
      repositionInputs={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snapPoint}
      setActiveSnapPoint={setSnapPoint}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content
          ref={drawerRef}
          className="bill-chat-drawer fixed inset-x-0 bottom-0 z-30 mt-0 flex h-full max-h-[97%] flex-col rounded-t-[10px] border bg-background"
          // The drawer is always open, so it is the top Radix layer and takes
          // Escape before the window listener that closes our sheets. Hand the
          // key to the topmost sheet (share, profile, tightness) instead.
          onEscapeKeyDown={(event) => {
            if (closeTopSheet()) event.preventDefault()
          }}
        >
          <div className="bill-chat-drawer-snap">
            <DrawerHandle />
            <DrawerTitle className="sr-only">Ask about this bill</DrawerTitle>
            <DrawerDescription className="sr-only">
              Pull up to ask follow-up questions without leaving the bill.
            </DrawerDescription>
            <div className="bill-chat-drawer-inner" data-bill={session.billId} data-snap={snap}>
              <div className="bill-chat-drawer-bar">
                <p className="feed-row-detail-heading bill-chat-drawer-bar-title" aria-hidden>
                  Ask about this bill
                </p>
                {snap === 'peek' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bill-chat-drawer-toggle"
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
                    className="bill-chat-drawer-toggle"
                    aria-expanded={true}
                    onClick={() => setSnapPoint(BILL_CHAT_DRAWER_PEEK)}
                  >
                    Minimize
                    <ChevronDownIcon />
                  </Button>
                )}
              </div>
              {snap === 'peek' ? null : <BillChatSection key={session.billId} {...session.chat} />}
            </div>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </Drawer>
  )
}

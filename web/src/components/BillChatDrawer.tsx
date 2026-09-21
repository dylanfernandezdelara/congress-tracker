import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
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
      // Peek is the one snap that unmounts the composer, so an unknown point
      // (vaul only reports listed snaps today) fails towards an open chat.
      return 'half'
  }
}

type SnapState = {
  /** Session the snap belongs to; a new occupant resets before its first paint. */
  sourceId: string | undefined
  /** `asks` already folded into `point`, so a later Ask can lift a peeked sheet. */
  asks: number
  point: number | string | null
}

function snapForNewOccupant(sourceId: string, asks: number): SnapState {
  return { sourceId, asks, point: asks > 0 ? BILL_CHAT_DRAWER_HALF : BILL_CHAT_DRAWER_PEEK }
}

function liftPeek(state: SnapState, asks: number): SnapState {
  const point = billChatDrawerSnap(state.point) === 'peek' ? BILL_CHAT_DRAWER_HALF : state.point
  return { ...state, asks, point }
}

/**
 * Vaul's Content is a Radix Dialog, whose FocusScope always `loop`s Tab back
 * inside the layer even when it is non-modal. With the drawer always open that
 * is a keyboard trap (WCAG 2.1.2): on peek the only stop is Open chat. Keep Tab
 * from reaching that handler so the browser moves focus out of the sheet.
 */
function letTabLeave(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key === 'Tab') event.stopPropagation()
}

/**
 * Mobile companion to the expanded bill: a non-modal vaul sheet (no overlay,
 * no body lock, handle-only drag) that peeks as a title bar and lifts to half
 * or full. Renders nothing until a bill presents a chat session.
 */
export function BillChatDrawer() {
  const session = useBillChatSession()
  const [snapState, setSnapState] = useState<SnapState>({
    sourceId: undefined,
    asks: 0,
    point: BILL_CHAT_DRAWER_PEEK,
  })

  // Derived during render, not in an effect: the drawer stays mounted across
  // bills, so a new occupant must paint at peek (or half when it arrives via
  // Ask) instead of inheriting the previous bill's snap and tweening down.
  // A further Ask on the same bill lifts a peeked sheet and leaves half / full
  // where the reader put it.
  let resolved = snapState
  if (session && snapState.sourceId !== session.sourceId) {
    resolved = snapForNewOccupant(session.sourceId, session.asks)
  } else if (session && session.asks > snapState.asks) {
    resolved = liftPeek(snapState, session.asks)
  }
  if (resolved !== snapState) setSnapState(resolved)

  const snapPoint = resolved.point
  const setSnapPoint = useCallback(
    (point: number | string | null) => setSnapState((state) => ({ ...state, point })),
    [],
  )
  const drawerRef = useBillChatDrawerSnapHeight(snapPoint)
  const snap = billChatDrawerSnap(snapPoint)

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
            <div
              className="bill-chat-drawer-inner"
              data-bill={session.billId}
              data-snap={snap}
              onKeyDown={letTabLeave}
            >
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

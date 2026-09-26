import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'

import { Sheet, SheetContent } from './dfdl/sheet'

type AnimatedSheetProps = {
  open: boolean
  selectionKey: number
  onClose: () => void
  titleId: string
  /** Visible label for the dismiss control (defaults to Close). */
  closeLabel?: string
  /**
   * When true, render the dismiss control in a sticky footer after children
   * (DOM order matches visual order). Default is the top toolbar.
   */
  footerDismiss?: boolean
  panelClassName?: string
  /** Latest `requestClose` so callers can animate-dismiss after in-app navigation. */
  requestCloseRef?: MutableRefObject<(() => void) | null>
  children: ReactNode
}

/**
 * Shared sheet chrome for member profiles, notable bills, bill share and the rest, on the dfdl Sheet
 * (Base UI Drawer): docked to the bottom on phones, centered from 640px, swipe to dismiss, focus trap,
 * scroll lock, and stacking when one sheet opens another. `onClose` runs after the exit animation.
 */
export function AnimatedSheet({
  open,
  selectionKey,
  onClose,
  titleId,
  closeLabel = 'Close',
  footerDismiss = false,
  panelClassName,
  requestCloseRef,
  children,
}: AnimatedSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [closing, setClosing] = useState(false)
  // Base UI skips the enter transition for a drawer that mounts already open, and these sheets mount when a
  // selection is made. Render closed for the first frame, then open, so the sheet slides in.
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    // Opened from code rather than a Base UI trigger: remember what had focus so closing returns there.
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [open])

  // A new selection (or reopening) cancels a dismiss that is still animating.
  useEffect(() => {
    setClosing(false)
  }, [open, selectionKey])

  const requestClose = useCallback(() => setClosing(true), [])

  useEffect(() => {
    if (!requestCloseRef) return
    requestCloseRef.current = requestClose
    return () => {
      requestCloseRef.current = null
    }
  }, [requestClose, requestCloseRef])

  const dismissButton = (
    <button ref={closeRef} type="button" className="sheet-close" onClick={requestClose}>
      {closeLabel}
    </button>
  )

  return (
    <Sheet
      open={open && entered && !closing}
      onOpenChange={(next) => {
        if (!next) setClosing(true)
      }}
      onOpenChangeComplete={(isOpen) => {
        // Only a real dismiss finishes here; the closed first frame before the enter animation must not.
        if (!isOpen && open && closing) {
          // Return focus before onClose: callers unmount the sheet there, before Base UI's own restore would run.
          const target = returnFocusRef.current
          if (target?.isConnected) target.focus({ preventScroll: true })
          onClose()
        }
      }}
    >
      <SheetContent
        className={panelClassName}
        aria-labelledby={titleId}
        initialFocus={closeRef}
        finalFocus={returnFocusRef}
        // A departing sheet is inert: unfocusable and hidden from assistive tech while it animates out.
        {...((open && closing) || !open ? { inert: '' } : {})}
      >
        {footerDismiss ? null : <div className="sheet-toolbar">{dismissButton}</div>}
        {children}
        {footerDismiss ? <div className="sheet-footer">{dismissButton}</div> : null}
      </SheetContent>
    </Sheet>
  )
}

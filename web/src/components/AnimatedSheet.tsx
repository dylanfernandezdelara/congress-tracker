import { useEffect, useRef, useState, type ReactNode } from 'react'

import { useAnimatedDismiss } from '../hooks/useAnimatedDismiss'
import {
  registerSheetLayer,
  SHEET_BASE_Z_INDEX,
  type SheetLayerController,
} from '../utils/sheetLayer'

const EXIT_ANIMATION_FALLBACK_MS = 400
const EXIT_ANIMATION_NAME = 'sheet-sink'

type AnimatedSheetProps = {
  open: boolean
  selectionKey: number
  onClose: () => void
  titleId: string
  /** Accessible name for the backdrop dismiss control. */
  closeAriaLabel: string
  /** Label for the dismiss control (defaults to Close). */
  closeLabel?: string
  /** Where to render the dismiss control. */
  dismissPlacement?: 'toolbar' | 'footer'
  panelClassName?: string
  children: ReactNode
}

/**
 * Shared bottom/centered sheet chrome used by member profiles and notable
 * bill details: backdrop, animated panel, focus trap, and body scroll lock.
 */
export function AnimatedSheet({
  open,
  selectionKey,
  onClose,
  titleId,
  closeAriaLabel,
  closeLabel = 'Close',
  dismissPlacement = 'toolbar',
  panelClassName,
  children,
}: AnimatedSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [layerZIndex, setLayerZIndex] = useState(SHEET_BASE_Z_INDEX)
  const controllerRef = useRef<SheetLayerController>({
    requestClose: () => undefined,
    getIsClosing: () => false,
    panel: null,
  })

  const { rootRef, panelRef, isClosing, getIsClosing, requestClose } = useAnimatedDismiss({
    onDismissed: onClose,
    exitAnimationName: EXIT_ANIMATION_NAME,
    fallbackMs: EXIT_ANIMATION_FALLBACK_MS,
    cancelKey: selectionKey,
    restoreFocusRef: closeRef,
  })

  controllerRef.current.requestClose = requestClose
  controllerRef.current.getIsClosing = getIsClosing
  controllerRef.current.panel = panelRef.current

  useEffect(() => {
    if (!open) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    returnFocusRef.current = previouslyFocused
    closeRef.current?.focus()

    const { unregister, zIndex } = registerSheetLayer(controllerRef.current)
    setLayerZIndex(zIndex)
    return () => {
      unregister()
      returnFocusRef.current?.focus()
      returnFocusRef.current = null
    }
  }, [open])

  // Keep the stack's panel pointer current after each paint.
  useEffect(() => {
    controllerRef.current.panel = panelRef.current
  })

  if (!open) return null

  const panelClasses = ['sheet-panel', panelClassName].filter(Boolean).join(' ')
  const dismissButton = (
    <button ref={closeRef} type="button" className="sheet-close" onClick={requestClose}>
      {closeLabel}
    </button>
  )

  return (
    <div
      ref={rootRef}
      className={`sheet-root${isClosing ? ' sheet-root--closing' : ''}`}
      style={{ zIndex: layerZIndex }}
      role="presentation"
    >
      <button
        type="button"
        className="sheet-backdrop"
        aria-label={closeAriaLabel}
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        className={panelClasses}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {dismissPlacement === 'toolbar' ? (
          <div className="sheet-toolbar">{dismissButton}</div>
        ) : null}
        {children}
        {dismissPlacement === 'footer' ? (
          <div className="sheet-footer">{dismissButton}</div>
        ) : null}
      </div>
    </div>
  )
}

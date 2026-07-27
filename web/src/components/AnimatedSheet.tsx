import { useEffect, useRef, type ReactNode } from 'react'

import { useAnimatedDismiss } from '../hooks/useAnimatedDismiss'
import { registerSheetLayer, type SheetLayerController } from '../utils/sheetLayer'

const EXIT_ANIMATION_FALLBACK_MS = 400
const EXIT_ANIMATION_NAME = 'sheet-sink'

type AnimatedSheetProps = {
  open: boolean
  selectionKey: number
  onClose: () => void
  titleId: string
  /** Accessible name for the backdrop dismiss control. */
  closeAriaLabel: string
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
  panelClassName,
  children,
}: AnimatedSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
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

    const unregister = registerSheetLayer(controllerRef.current)
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

  return (
    <div
      ref={rootRef}
      className={`sheet-root${isClosing ? ' sheet-root--closing' : ''}`}
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
        <div className="sheet-toolbar">
          <button
            ref={closeRef}
            type="button"
            className="sheet-close"
            onClick={requestClose}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

import { useEffect, useRef, type ReactNode } from 'react'

import { useAnimatedDismiss } from '../hooks/useAnimatedDismiss'

const EXIT_ANIMATION_FALLBACK_MS = 400
const EXIT_ANIMATION_NAME = 'member-profile-sink'

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

  const { rootRef, panelRef, isClosing, getIsClosing, requestClose } = useAnimatedDismiss({
    onDismissed: onClose,
    exitAnimationName: EXIT_ANIMATION_NAME,
    fallbackMs: EXIT_ANIMATION_FALLBACK_MS,
    cancelKey: selectionKey,
    restoreFocusRef: closeRef,
  })

  useEffect(() => {
    if (!open) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    returnFocusRef.current = previouslyFocused

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current || getIsClosing()) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      returnFocusRef.current?.focus()
      returnFocusRef.current = null
    }
  }, [open, requestClose, getIsClosing])

  if (!open) return null

  const panelClasses = ['member-profile-panel', panelClassName].filter(Boolean).join(' ')

  return (
    <div
      ref={rootRef}
      className={`member-profile-root${isClosing ? ' member-profile-root--closing' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="member-profile-backdrop"
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
        <div className="member-profile-toolbar">
          <button
            ref={closeRef}
            type="button"
            className="member-profile-close"
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

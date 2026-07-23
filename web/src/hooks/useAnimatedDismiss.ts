import { useCallback, useEffect, useRef, useState } from 'react'

type UseAnimatedDismissOptions = {
  /** Called once the exit animation finishes (or immediately under reduced motion). */
  onDismissed: () => void
  /** Only animationend events with this name finish the dismissal; enter animations are ignored. */
  exitAnimationName: string
  /** Safety net in case animationend never fires; should exceed the exit animation duration. */
  fallbackMs: number
}

type UseAnimatedDismissResult = {
  /** Attach to the overlay root; receives the `inert` attribute while closing. */
  rootRef: React.RefObject<HTMLDivElement>
  /** Attach to the animated panel; its animationend drives dismissal. */
  panelRef: React.RefObject<HTMLDivElement>
  isClosing: boolean
  /** Ref mirror of isClosing for use inside stable event handlers. */
  isClosingRef: React.RefObject<boolean>
  /** Start the exit animation (no-op if already closing; immediate under reduced motion). */
  requestClose: () => void
  /** Abort a pending close, e.g. when the overlay is re-purposed for a new selection. */
  cancelClose: () => void
}

/* Animated dismissal for a modal overlay: the caller keeps the overlay mounted
   with `isClosing` styling until the panel's exit animation ends, then
   `onDismissed` fires. While closing, the root gets the `inert` attribute
   (toggled imperatively — React 18 has no `inert` prop) so the departing
   dialog is unfocusable and hidden from assistive tech. */
export function useAnimatedDismiss({
  onDismissed,
  exitAnimationName,
  fallbackMs,
}: UseAnimatedDismissOptions): UseAnimatedDismissResult {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const isClosingRef = useRef(false)
  const onDismissedRef = useRef(onDismissed)
  useEffect(() => {
    onDismissedRef.current = onDismissed
  }, [onDismissed])

  const finishClose = useCallback(() => {
    if (!isClosingRef.current) return
    isClosingRef.current = false
    setIsClosing(false)
    onDismissedRef.current()
  }, [])

  const requestClose = useCallback(() => {
    if (isClosingRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDismissedRef.current()
      return
    }
    isClosingRef.current = true
    setIsClosing(true)
  }, [])

  const cancelClose = useCallback(() => {
    if (!isClosingRef.current) return
    isClosingRef.current = false
    setIsClosing(false)
  }, [])

  useEffect(() => {
    if (!isClosing) return
    const root = rootRef.current
    root?.setAttribute('inert', '')
    const panel = panelRef.current
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.target === panel && event.animationName === exitAnimationName) finishClose()
    }
    panel?.addEventListener('animationend', handleAnimationEnd)
    const timer = window.setTimeout(finishClose, fallbackMs)
    return () => {
      root?.removeAttribute('inert')
      panel?.removeEventListener('animationend', handleAnimationEnd)
      window.clearTimeout(timer)
    }
  }, [isClosing, finishClose, exitAnimationName, fallbackMs])

  return { rootRef, panelRef, isClosing, isClosingRef, requestClose, cancelClose }
}

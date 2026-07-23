import { useCallback, useEffect, useRef, useState } from 'react'

type UseAnimatedDismissOptions = {
  /** Called once the exit animation finishes (or immediately under reduced motion). */
  onDismissed: () => void
  /** Only animationend events with this name finish the dismissal; enter animations are ignored. */
  exitAnimationName: string
  /** Safety net in case animationend never fires; should exceed the exit animation duration. */
  fallbackMs: number
  /* A change cancels a pending close: the overlay is being re-purposed for a
     new selection, so it should stay open instead of finishing the dismissal. */
  cancelKey: unknown
  /** Focused after a cancelled close, once the inert attribute has been removed. */
  restoreFocusRef?: React.RefObject<HTMLElement | null>
}

type UseAnimatedDismissResult = {
  /** Attach to the overlay root; receives the `inert` attribute while closing. */
  rootRef: React.RefObject<HTMLDivElement>
  /** Attach to the animated panel; its animationend drives dismissal. */
  panelRef: React.RefObject<HTMLDivElement>
  isClosing: boolean
  /** Stable reader for use inside long-lived event handlers. */
  getIsClosing: () => boolean
  /** Start the exit animation (no-op if already closing; immediate under reduced motion). */
  requestClose: () => void
}

/* Animated dismissal for a modal overlay: the caller keeps the overlay mounted
   with `isClosing` styling until the panel's exit animation ends, then
   `onDismissed` fires. While closing, the root gets the `inert` attribute
   (toggled imperatively — React 18 has no `inert` prop) so the departing
   dialog is unfocusable and hidden from assistive tech. A `cancelKey` change
   aborts a pending close and restores focus into the still-open overlay. */
export function useAnimatedDismiss({
  onDismissed,
  exitAnimationName,
  fallbackMs,
  cancelKey,
  restoreFocusRef,
}: UseAnimatedDismissOptions): UseAnimatedDismissResult {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)
  const isClosingRef = useRef(false)
  const cancelledRef = useRef(false)
  const onDismissedRef = useRef(onDismissed)
  useEffect(() => {
    onDismissedRef.current = onDismissed
  }, [onDismissed])

  const getIsClosing = useCallback(() => isClosingRef.current, [])

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

  const prevCancelKeyRef = useRef(cancelKey)
  useEffect(() => {
    if (prevCancelKeyRef.current === cancelKey) return
    prevCancelKeyRef.current = cancelKey
    if (!isClosingRef.current) return
    isClosingRef.current = false
    cancelledRef.current = true
    setIsClosing(false)
  }, [cancelKey])

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

  /* After a cancelled close, focus is still on whatever background element
     triggered the new selection (the inert root blurred the overlay); pull it
     back inside. Declared after the inert effect so its cleanup has already
     removed the inert attribute when this runs. Finished closes never set
     cancelledRef, so they are unaffected. */
  useEffect(() => {
    if (isClosing || !cancelledRef.current) return
    cancelledRef.current = false
    restoreFocusRef?.current?.focus()
  }, [isClosing, restoreFocusRef])

  return { rootRef, panelRef, isClosing, getIsClosing, requestClose }
}

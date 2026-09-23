import { useCallback, useEffect, useRef } from 'react'

/**
 * Vaul 1.1.2 keeps a snap-point sheet at h-full / max-h-[97%] and translates
 * it by `--snap-point-height` (container height minus the snap height), so
 * the sheet's own box is never the visible slice. This hook sizes the direct
 * child `.bill-chat-drawer-snap` to the slice that is actually on screen —
 * viewport minus the sheet's live top — so the composer stays inside the
 * half / full window after the transcript grows.
 *
 * Vaul only rewrites `--snap-point-height` once a snap settles, and its
 * transform transition interpolates without further style writes, so the
 * measurement runs on every style mutation and resize, and on a rAF loop for
 * the transition's duration whenever the snap changes or a transform
 * transition starts (Open chat / Minimize, a same-snap rubber-band). The
 * drawer also sets `repositionInputs={false}`: the default rewrites Content
 * height when the keyboard opens, and `100% - offset` then collapses.
 */

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

/** Returns a ref callback for the vaul `Drawer.Content` element. */
export function useBillChatDrawerSnapHeight(snapPoint: number | string | null) {
  const remeasureRef = useRef<() => void>(() => {})
  const cleanupRef = useRef<(() => void) | null>(null)

  const bind = useCallback((node: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    remeasureRef.current = () => {}
    if (!node) return

    let raf = 0
    const sync = () => syncBillChatDrawerSnapHeight(node)
    const remeasureUntilSettled = () => {
      cancelAnimationFrame(raf)
      const deadline = performance.now() + BILL_CHAT_DRAWER_TRANSITION_MS
      const tick = (now: number) => {
        sync()
        if (now < deadline) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    remeasureRef.current = remeasureUntilSettled
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(node, { attributes: true, attributeFilter: ['style'] })
    const onTransition = (event: TransitionEvent) => {
      if (event.target !== node) return
      if (event.propertyName && event.propertyName !== 'transform') return
      if (event.type === 'transitionrun') remeasureUntilSettled()
      else sync()
    }
    node.addEventListener('transitionrun', onTransition)
    node.addEventListener('transitionend', onTransition)
    window.addEventListener('resize', sync)
    cleanupRef.current = () => {
      cancelAnimationFrame(raf)
      remeasureRef.current = () => {}
      mo.disconnect()
      node.removeEventListener('transitionrun', onTransition)
      node.removeEventListener('transitionend', onTransition)
      window.removeEventListener('resize', sync)
    }
  }, [])

  useEffect(() => {
    remeasureRef.current()
  }, [snapPoint])

  return bind
}

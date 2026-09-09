import { useCallback, useEffect, useState, type RefObject } from 'react'

import { cleanQuoteText } from '@congress-tracker/shared/quote-verification'

/** Attribute marking text a reader may quote. Value is the source kind (`digest`, `crs`, `answer`). */
export const QUOTABLE_ATTR = 'data-quotable'

export type TextSelection = {
  /** Whitespace-collapsed selected text. */
  text: string
  /** Which quotable region the selection sits in (`data-quotable` value). */
  source: string
  /** Viewport rectangle of the selection, refreshed on scroll. */
  rect: DOMRect
}

const SETTLE_MS = 120

function closestQuotable(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null
  return element?.closest<HTMLElement>(`[${QUOTABLE_ATTR}]`) ?? null
}

/** Current selection when it lies within one quotable region inside `container`. */
export function readQuotableSelection(container: HTMLElement | null): TextSelection | null {
  if (!container || typeof window === 'undefined') return null
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const start = closestQuotable(range.startContainer)
  const end = closestQuotable(range.endContainer)
  if (!start || start !== end) return null
  const text = cleanQuoteText(selection.toString())
  if (!text) return null
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { text, source: start.getAttribute(QUOTABLE_ATTR) || 'digest', rect }
}

/**
 * F2 selection menu state. Tracks `selectionchange` (settled) plus pointer/key
 * release, scoped to `containerRef` and `[data-quotable]` regions. `clear()`
 * also collapses the DOM selection so the menu does not reappear.
 */
export function useTextSelectionMenu(
  containerRef: RefObject<HTMLElement | null>,
  options: { enabled?: boolean } = {},
): { selection: TextSelection | null; clear: () => void } {
  const enabled = options.enabled ?? true
  const [selection, setSelection] = useState<TextSelection | null>(null)

  const clear = useCallback(() => {
    setSelection(null)
    const domSelection = typeof window !== 'undefined' ? window.getSelection() : null
    if (domSelection && !domSelection.isCollapsed) domSelection.removeAllRanges()
  }, [])

  useEffect(() => {
    if (!enabled) {
      setSelection(null)
      return
    }
    let timer: number | null = null
    const refresh = () => {
      setSelection(readQuotableSelection(containerRef.current))
    }
    const scheduleRefresh = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        refresh()
      }, SETTLE_MS)
    }
    const onScroll = () => {
      setSelection((current) => (current ? readQuotableSelection(containerRef.current) : current))
    }
    document.addEventListener('selectionchange', scheduleRefresh)
    document.addEventListener('pointerup', scheduleRefresh)
    document.addEventListener('keyup', scheduleRefresh)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener('selectionchange', scheduleRefresh)
      document.removeEventListener('pointerup', scheduleRefresh)
      document.removeEventListener('keyup', scheduleRefresh)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [containerRef, enabled])

  return { selection, clear }
}

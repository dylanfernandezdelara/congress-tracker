import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import type { TextSelection } from '../hooks/useTextSelectionMenu'

type SelectionMenuProps = {
  selection: TextSelection | null
  /** Short inline feedback (`Copied`, validation copy). Replaces the buttons while set. */
  status?: string | null
  busy?: boolean
  onShareQuote: (selection: TextSelection) => void
  /** Hidden when omitted (chat ships separately). */
  onAsk?: (selection: TextSelection) => void
  onCopy: (selection: TextSelection) => void
}

const VIEWPORT_MARGIN = 8
const GAP = 10

function menuPosition(rect: DOMRect, size: { width: number; height: number }): CSSProperties {
  const viewportWidth = window.innerWidth
  const half = size.width / 2
  const centerX = Math.min(
    Math.max(rect.left + rect.width / 2, VIEWPORT_MARGIN + half),
    viewportWidth - VIEWPORT_MARGIN - half,
  )
  const above = rect.top - GAP - size.height
  const placeAbove = above >= VIEWPORT_MARGIN
  const top = placeAbove ? above : rect.bottom + GAP
  return { top, left: centerX, transform: 'translateX(-50%)' }
}

/**
 * F2 floating actions for a text selection: `Share quote` · `Ask about this` · `Copy`.
 * Rendered in a portal so it is never clipped by the detail panel; `mousedown`
 * is swallowed so clicking a button keeps the DOM selection alive.
 */
export function SelectionMenu({
  selection,
  status,
  busy = false,
  onShareQuote,
  onAsk,
  onCopy,
}: SelectionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const next = { width: el.offsetWidth, height: el.offsetHeight }
    if (next.width !== size.width || next.height !== size.height) setSize(next)
  })

  if (!selection || typeof document === 'undefined') return null

  const style = size.width > 0 ? menuPosition(selection.rect, size) : { top: -9999, left: -9999 }

  return createPortal(
    <div
      ref={menuRef}
      className={`selection-menu${status ? ' selection-menu--status' : ''}`}
      role="toolbar"
      aria-label="Selected text actions"
      style={style}
      onMouseDown={(event) => event.preventDefault()}
    >
      {status ? (
        <p className="selection-menu-status" role="status">
          {status}
        </p>
      ) : (
        <>
          <button
            type="button"
            className="selection-menu-button"
            disabled={busy}
            onClick={() => onShareQuote(selection)}
          >
            {busy ? 'Sharing…' : 'Share quote'}
          </button>
          {onAsk ? (
            <button
              type="button"
              className="selection-menu-button"
              disabled={busy}
              onClick={() => onAsk(selection)}
            >
              Ask about this
            </button>
          ) : null}
          <button
            type="button"
            className="selection-menu-button"
            disabled={busy}
            onClick={() => onCopy(selection)}
          >
            Copy
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}

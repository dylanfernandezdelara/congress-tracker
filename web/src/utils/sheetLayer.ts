/**
 * Stack of open sheets so body scroll lock and Escape/Tab handling stay
 * correct when multiple overlays can exist (e.g. left-rail profile + notable bill).
 */

export type SheetLayerController = {
  requestClose: () => void
  getIsClosing: () => boolean
  panel: HTMLElement | null
}

/** Matches `.sheet-root` base z-index in sheet.css; each stacked sheet adds +1. */
export const SHEET_BASE_Z_INDEX = 40

const stack: SheetLayerController[] = []
let keyListenerAttached = false
let previousBodyOverflow = ''

function onGlobalKeyDown(event: KeyboardEvent) {
  const top = stack[stack.length - 1]
  if (!top || top.getIsClosing()) return

  if (event.key === 'Escape') {
    event.preventDefault()
    top.requestClose()
    return
  }

  if (event.key !== 'Tab' || !top.panel) return
  const focusable = top.panel.querySelectorAll<HTMLElement>(
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

function ensureKeyListener() {
  if (keyListenerAttached) return
  window.addEventListener('keydown', onGlobalKeyDown)
  keyListenerAttached = true
}

function releaseKeyListener() {
  if (!keyListenerAttached || stack.length > 0) return
  window.removeEventListener('keydown', onGlobalKeyDown)
  keyListenerAttached = false
}

export type SheetLayerRegistration = {
  /** Unregister this sheet from the stack. */
  unregister: () => void
  /** z-index for this sheet so paint order matches stack order. */
  zIndex: number
}

/** Register an open sheet; returns unregister + paint z-index for this layer. */
export function registerSheetLayer(controller: SheetLayerController): SheetLayerRegistration {
  if (stack.length === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ensureKeyListener()
  }
  stack.push(controller)
  const zIndex = SHEET_BASE_Z_INDEX + stack.length - 1

  return {
    zIndex,
    unregister: () => {
      const index = stack.lastIndexOf(controller)
      if (index >= 0) stack.splice(index, 1)
      if (stack.length === 0) {
        document.body.style.overflow = previousBodyOverflow
        previousBodyOverflow = ''
        releaseKeyListener()
      }
    },
  }
}

/** Test helper — clears lock state between cases. */
export function resetSheetLayerForTests(): void {
  stack.length = 0
  if (keyListenerAttached) {
    window.removeEventListener('keydown', onGlobalKeyDown)
    keyListenerAttached = false
  }
  document.body.style.overflow = ''
  previousBodyOverflow = ''
}

/** Test helper — current stack depth (0 when empty). */
export function sheetLayerDepthForTests(): number {
  return stack.length
}

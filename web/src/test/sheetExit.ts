import { fireEvent, waitFor } from '@testing-library/react'
import { expect, onTestFinished } from 'vitest'

/**
 * Holds the sheet's exit animation open in jsdom, which has no Web Animations API, so a test can act while a
 * sheet is closing and then let it finish. Base UI (behind the dfdl Sheet) waits on `element.getAnimations()`
 * before it completes a close; this reports one running animation on sheet popups until `finish()`.
 * Call it after the sheet has opened, then trigger the close. The stub is removed when the test ends.
 */
export function holdSheetExit() {
  let resolve!: () => void
  const animation = {
    pending: false,
    playState: 'running',
    finished: new Promise<void>((r) => {
      resolve = r
    }),
  }
  const proto = Element.prototype as unknown as { getAnimations?: (this: Element) => unknown[] }
  const hadOwn = Object.prototype.hasOwnProperty.call(proto, 'getAnimations')
  const previous = proto.getAnimations
  proto.getAnimations = function (this: Element) {
    return this.matches('[data-slot="sheet"]') && animation.playState === 'running' ? [animation] : []
  }
  onTestFinished(() => {
    if (hadOwn) proto.getAnimations = previous
    else delete proto.getAnimations
  })
  return {
    finish() {
      // The stub stays until the test ends and reports no animations, which is what jsdom means anyway:
      // Base UI re-checks getAnimations() once more after the promise settles.
      animation.playState = 'finished'
      resolve()
    },
  }
}

/**
 * Presses Escape the way a person would: once the sheet has taken focus (a frame after it opens). Pressing it
 * earlier sends Escape to whatever sheet or page still holds focus.
 */
export async function pressEscapeIn(dialog: HTMLElement) {
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
}

/** Lets Base UI finish any pending open/close work (it schedules on animation frames) before asserting nothing happened. */
export async function settleSheets() {
  for (let i = 0; i < 3; i += 1) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }
  await Promise.resolve()
}

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BILL_CHAT_DRAWER_TRANSITION_MS,
  billChatVisibleSlicePx,
  syncBillChatDrawerSnapHeight,
  useBillChatDrawerSnapHeight,
} from './useBillChatDrawerSnapHeight'

function drawerWithSnap(top: number) {
  const drawer = document.createElement('div')
  const snap = document.createElement('div')
  snap.className = 'bill-chat-drawer-snap'
  drawer.appendChild(snap)
  drawer.getBoundingClientRect = () => ({ top }) as DOMRect
  document.body.appendChild(drawer)
  return { drawer, snap }
}

const innerHeight = window.innerHeight

afterEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight })
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('billChatVisibleSlicePx', () => {
  it('is the viewport below the translated sheet top, never negative', () => {
    expect(billChatVisibleSlicePx(422, 844)).toBe(422)
    expect(billChatVisibleSlicePx(664, 844)).toBe(180)
    expect(billChatVisibleSlicePx(900, 844)).toBe(0)
    expect(billChatVisibleSlicePx(Number.NaN, 844)).toBe(0)
  })

  it('writes the slice onto the direct .bill-chat-drawer-snap child only', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    const { drawer, snap } = drawerWithSnap(600)
    syncBillChatDrawerSnapHeight(drawer)
    expect(snap.style.height).toBe('244px')

    const bare = document.createElement('div')
    expect(() => syncBillChatDrawerSnapHeight(bare)).not.toThrow()
  })
})

describe('useBillChatDrawerSnapHeight', () => {
  it('measures on bind, on style mutations, and on resize', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    const { drawer, snap } = drawerWithSnap(600)
    const { result } = renderHook(() => useBillChatDrawerSnapHeight('128px'))

    act(() => result.current(drawer as HTMLDivElement))
    expect(snap.style.height).toBe('244px')

    drawer.getBoundingClientRect = () => ({ top: 422 }) as DOMRect
    drawer.style.transform = 'translate3d(0, 422px, 0)'
    await waitFor(() => expect(snap.style.height).toBe('422px'))

    drawer.getBoundingClientRect = () => ({ top: 300 }) as DOMRect
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(snap.style.height).toBe('544px')
  })

  it('keeps measuring through a vaul transform transition and after a snap change', () => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    const { drawer, snap } = drawerWithSnap(716)
    const { result, rerender } = renderHook(
      ({ snapPoint }: { snapPoint: number | string }) => useBillChatDrawerSnapHeight(snapPoint),
      { initialProps: { snapPoint: '128px' as number | string } },
    )
    act(() => result.current(drawer as HTMLDivElement))
    expect(snap.style.height).toBe('128px')

    // Vaul writes no style while its transform interpolates; the sheet top
    // still moves, so the rAF loop has to notice it.
    drawer.getBoundingClientRect = () => ({ top: 500 }) as DOMRect
    act(() => {
      const run = new Event('transitionrun') as TransitionEvent
      Object.defineProperty(run, 'propertyName', { value: 'transform' })
      drawer.dispatchEvent(run)
      vi.advanceTimersByTime(BILL_CHAT_DRAWER_TRANSITION_MS / 2)
    })
    expect(snap.style.height).toBe('344px')

    drawer.getBoundingClientRect = () => ({ top: 422 }) as DOMRect
    act(() => {
      vi.advanceTimersByTime(BILL_CHAT_DRAWER_TRANSITION_MS)
    })
    expect(snap.style.height).toBe('422px')

    // Same-snap rubber-band: no transition event, only the prop changes.
    drawer.getBoundingClientRect = () => ({ top: 127 }) as DOMRect
    rerender({ snapPoint: 0.85 })
    act(() => {
      vi.advanceTimersByTime(BILL_CHAT_DRAWER_TRANSITION_MS)
    })
    expect(snap.style.height).toBe('717px')

    // Unbinding stops the loop.
    act(() => result.current(null))
    drawer.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    act(() => {
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(BILL_CHAT_DRAWER_TRANSITION_MS)
    })
    expect(snap.style.height).toBe('717px')
  })
})

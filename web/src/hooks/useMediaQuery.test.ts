import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMediaQuery } from './useMediaQuery'

type Listener = (event: MediaQueryListEvent) => void

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<Listener>()
  const mediaQueryList = {
    matches: initialMatches,
    media: '(min-width: 1024px)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: Listener) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: Listener) => {
      listeners.delete(listener)
    }),
    addListener: vi.fn((listener: Listener) => {
      listeners.add(listener)
    }),
    removeListener: vi.fn((listener: Listener) => {
      listeners.delete(listener)
    }),
    dispatchEvent: () => false,
  }

  window.matchMedia = vi.fn().mockReturnValue(mediaQueryList)

  return {
    mediaQueryList,
    setMatches(next: boolean) {
      mediaQueryList.matches = next
      const event = { matches: next } as MediaQueryListEvent
      for (const listener of listeners) listener(event)
    },
  }
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the current matchMedia result and updates on change', () => {
    const media = mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))

    expect(result.current).toBe(false)

    act(() => {
      media.setMatches(true)
    })

    expect(result.current).toBe(true)
  })

  it('removes the media query listener on unmount', () => {
    const { mediaQueryList } = mockMatchMedia(true)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'))

    expect(mediaQueryList.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    unmount()
    expect(mediaQueryList.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    )
  })

  it('returns false when matchMedia is unavailable', () => {
    // @ts-expect-error -- simulate environments without matchMedia
    window.matchMedia = undefined
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { shouldIgnoreFlipClick } from './flipCardInteraction'

describe('shouldIgnoreFlipClick', () => {
  it('ignores clicks after a drag beyond the threshold', () => {
    expect(shouldIgnoreFlipClick(0, 0, 15, 0)).toBe(true)
    expect(shouldIgnoreFlipClick(0, 0, 0, 12)).toBe(true)
  })

  it('allows clicks within the threshold', () => {
    expect(shouldIgnoreFlipClick(0, 0, 5, 5)).toBe(false)
    expect(shouldIgnoreFlipClick(100, 100, 108, 106)).toBe(false)
  })

  it('ignores clicks when the scroll container moved between pointerdown and click', () => {
    expect(shouldIgnoreFlipClick(0, 0, 0, 0, 10, 100, 110)).toBe(true)
    expect(shouldIgnoreFlipClick(0, 0, 0, 0, 10, 628, 796)).toBe(true)
  })

  it('allows clicks when scroll movement is within the scroll threshold', () => {
    expect(shouldIgnoreFlipClick(0, 0, 0, 0, 10, 100, 101)).toBe(false)
    expect(shouldIgnoreFlipClick(0, 0, 0, 0, 10, 100, 102)).toBe(false)
  })

  it('skips scroll check when scroll positions are omitted', () => {
    expect(shouldIgnoreFlipClick(0, 0, 0, 0)).toBe(false)
  })
})

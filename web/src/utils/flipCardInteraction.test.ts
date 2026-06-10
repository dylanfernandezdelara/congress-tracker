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
})

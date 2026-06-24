import { describe, expect, it } from 'vitest'

import { SENATE_CLASS_2_STATES } from './senate-class'

describe('senate-class', () => {
  it('lists 33 Class II states for the 2026 cycle', () => {
    expect(SENATE_CLASS_2_STATES.size).toBe(33)
    expect(SENATE_CLASS_2_STATES.has('TX')).toBe(true)
    expect(SENATE_CLASS_2_STATES.has('CA')).toBe(false)
  })
})

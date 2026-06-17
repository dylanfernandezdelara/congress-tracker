import { describe, expect, it } from 'vitest'

import { policyAreaHue } from './policyAreaChip'

describe('policyAreaHue', () => {
  it('returns stable hues for known policy areas', () => {
    expect(policyAreaHue('Energy')).toBe(38)
    expect(policyAreaHue('Defense')).toBe(220)
    expect(policyAreaHue('Health')).toBe(168)
  })

  it('returns the same hue for the same unknown label', () => {
    const a = policyAreaHue('Custom Topic')
    const b = policyAreaHue('Custom Topic')
    expect(a).toBe(b)
  })

  it('maps procedural labels to neutral hue', () => {
    expect(policyAreaHue('Procedural')).toBe(0)
  })
})

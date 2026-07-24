import { describe, expect, it } from 'vitest'

import { partySeatColor } from './chamberPartyColors'

describe('partySeatColor', () => {
  it('returns CSS custom-property colors for known parties', () => {
    expect(partySeatColor('R')).toBe('hsl(var(--twc-party-r))')
    expect(partySeatColor('D')).toBe('hsl(var(--twc-party-d))')
    expect(partySeatColor('I')).toBe('hsl(var(--twc-party-i))')
    expect(partySeatColor('Other')).toBe('hsl(var(--twc-party-other))')
  })

  it('falls back to other for unknown codes', () => {
    expect(partySeatColor('X')).toBe('hsl(var(--twc-party-other))')
  })
})

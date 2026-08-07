import { describe, expect, it } from 'vitest'

import { parseUsStateCode, usStateDisplayName, US_STATE_OPTIONS } from './us-states'

describe('US_STATE_OPTIONS', () => {
  it('includes New York and keeps codes unique', () => {
    expect(US_STATE_OPTIONS.some((s) => s.code === 'NY' && s.name === 'New York')).toBe(true)
    const codes = US_STATE_OPTIONS.map((s) => s.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('parseUsStateCode', () => {
  it('accepts known codes case-insensitively and trims', () => {
    expect(parseUsStateCode('ny')).toBe('NY')
    expect(parseUsStateCode(' NY ')).toBe('NY')
    expect(parseUsStateCode('DC')).toBe('DC')
  })

  it('returns null for empty, absent, or unknown values', () => {
    expect(parseUsStateCode(null)).toBeNull()
    expect(parseUsStateCode(undefined)).toBeNull()
    expect(parseUsStateCode('')).toBeNull()
    expect(parseUsStateCode('   ')).toBeNull()
    expect(parseUsStateCode('New York')).toBeNull()
    expect(parseUsStateCode('XX')).toBeNull()
  })
})

describe('usStateDisplayName', () => {
  it('maps codes to display names', () => {
    expect(usStateDisplayName('NY')).toBe('New York')
    expect(usStateDisplayName('ny')).toBe('New York')
    expect(usStateDisplayName('ZZ')).toBeNull()
  })
})

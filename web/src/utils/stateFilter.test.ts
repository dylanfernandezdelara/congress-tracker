import { describe, expect, it } from 'vitest'

import { parseStateFilter, stateFilterLabel } from './stateFilter'

describe('parseStateFilter', () => {
  it('accepts known 2-letter codes', () => {
    expect(parseStateFilter('ny')).toBe('NY')
    expect(parseStateFilter('NY')).toBe('NY')
  })

  it('rejects unknown or empty values', () => {
    expect(parseStateFilter(null)).toBeNull()
    expect(parseStateFilter('')).toBeNull()
    expect(parseStateFilter('New York')).toBeNull()
  })
})

describe('stateFilterLabel', () => {
  it('labels all-states and known codes', () => {
    expect(stateFilterLabel(null)).toBe('All states')
    expect(stateFilterLabel('NY')).toBe('New York')
  })
})

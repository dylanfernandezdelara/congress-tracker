import { describe, expect, it } from 'vitest'

import { formatBillDocket, formatCoverageDate, formatVoteDate } from './billLabels'

describe('formatBillDocket', () => {
  it('formats concurrent resolutions', () => {
    expect(formatBillDocket('hconres', 84, 119)).toBe('H.Con.Res. 84 · 119th Congress')
  })

  it('formats joint resolutions', () => {
    expect(formatBillDocket('HJRES', 12, 119)).toBe('H.J.Res. 12 · 119th Congress')
  })
})

describe('formatVoteDate', () => {
  it('formats ISO dates as short month and day', () => {
    expect(formatVoteDate('2026-06-30')).toBe('Jun 30')
  })
})

describe('formatCoverageDate', () => {
  it('formats ISO dates with the year included', () => {
    expect(formatCoverageDate('2026-06-30')).toBe('Jun 30, 2026')
  })
})

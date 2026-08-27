import { describe, expect, it } from 'vitest'

import {
  formatBillDocket,
  formatCoverageDate,
  formatVoteDate,
  formatWeekdayVoteDate,
} from './billLabels'

describe('formatBillDocket', () => {
  it('re-exports shared bill docket formatting', () => {
    expect(formatBillDocket('hconres', 84, 119)).toBe('H.Con.Res. 84 · 119th Congress')
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

describe('formatWeekdayVoteDate', () => {
  it('formats UTC calendar days with the weekday', () => {
    expect(formatWeekdayVoteDate('2026-08-31')).toBe('Monday, Aug 31')
    expect(formatWeekdayVoteDate('2026-09-14')).toBe('Monday, Sep 14')
  })
})

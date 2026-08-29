import { describe, expect, it } from 'vitest'

import {
  formatBillDocket,
  formatCoverageDate,
  formatDateRange,
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

describe('formatDateRange', () => {
  it('collapses a same-month span and keeps mixed months readable', () => {
    expect(formatDateRange('2026-08-19', '2026-08-19')).toBe('Aug 19')
    expect(formatDateRange('2026-08-19', '2026-08-24')).toBe('Aug 19–24')
    expect(formatDateRange('2026-08-19', '2026-09-02')).toBe('Aug 19 – Sep 2')
    expect(formatDateRange(null, null)).toBeNull()
  })

  it('keeps the year when a span crosses a calendar year', () => {
    expect(formatDateRange('2025-08-19', '2026-08-24')).toBe('Aug 19, 2025 – Aug 24, 2026')
    expect(formatDateRange('2025-01-10', '2026-01-15')).toBe('Jan 10, 2025 – Jan 15, 2026')
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

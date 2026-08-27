import { describe, expect, it } from 'vitest'

import {
  addUtcIsoDays,
  maxIsoDay,
  parseIsoDay,
  utcCalendarDaysSince,
  utcIsoDay,
  utcIsoWeekday,
} from './iso-day'

describe('parseIsoDay', () => {
  it('keeps a calendar day and slices datetimes', () => {
    expect(parseIsoDay('2026-08-08')).toBe('2026-08-08')
    expect(parseIsoDay(' 2026-08-08T16:00:00.000Z ')).toBe('2026-08-08')
    expect(parseIsoDay(null)).toBeNull()
    expect(parseIsoDay('not-a-date')).toBeNull()
  })
})

describe('utcIsoDay', () => {
  it('returns the UTC calendar day', () => {
    expect(utcIsoDay(new Date('2026-08-27T01:15:00.000Z'))).toBe('2026-08-27')
    expect(utcIsoDay(new Date('2026-08-27T23:59:59.000Z'))).toBe('2026-08-27')
  })
})

describe('addUtcIsoDays', () => {
  it('steps whole UTC days and rejects junk', () => {
    expect(addUtcIsoDays('2026-08-27', 4)).toBe('2026-08-31')
    expect(addUtcIsoDays('2026-09-11', 1)).toBe('2026-09-12')
    expect(addUtcIsoDays('not-a-date', 1)).toBeNull()
  })
})

describe('utcIsoWeekday', () => {
  it('uses UTC weekdays', () => {
    expect(utcIsoWeekday('2026-08-31')).toBe(1)
    expect(utcIsoWeekday('2026-09-12')).toBe(6)
    expect(utcIsoWeekday('bad')).toBeNull()
  })
})

describe('maxIsoDay', () => {
  it('returns the latest valid calendar day', () => {
    expect(maxIsoDay(['2026-04-10', null, '2026-08-08T16:00:00.000Z'])).toBe('2026-08-08')
    expect(maxIsoDay([null, 'not-a-date'])).toBeNull()
  })
})

describe('utcCalendarDaysSince', () => {
  const now = new Date('2026-08-25T20:18:00.000Z')

  it('counts whole UTC days from an ISO date', () => {
    expect(utcCalendarDaysSince('2026-08-25', now)).toBe(0)
    expect(utcCalendarDaysSince('2026-08-24', now)).toBe(1)
    expect(utcCalendarDaysSince('2026-08-08', now)).toBe(17)
  })

  it('accepts a datetime and uses the UTC calendar date', () => {
    expect(utcCalendarDaysSince('2026-08-08T16:00:00.000Z', now)).toBe(17)
  })

  it('clamps future dates to 0 and rejects junk', () => {
    expect(utcCalendarDaysSince('2026-08-26', now)).toBe(0)
    expect(utcCalendarDaysSince('not-a-date', now)).toBeNull()
    expect(utcCalendarDaysSince('', now)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import {
  FLOOR_QUIET_AFTER_DAYS,
  floorQuietDays,
  isFloorQuiet,
  isFloorQuietDays,
  parseIsoDay,
  utcCalendarDaysSince,
} from './floor-quiet'

describe('parseIsoDay', () => {
  it('keeps a calendar day and slices datetimes', () => {
    expect(parseIsoDay('2026-08-08')).toBe('2026-08-08')
    expect(parseIsoDay(' 2026-08-08T16:00:00.000Z ')).toBe('2026-08-08')
    expect(parseIsoDay(null)).toBeNull()
    expect(parseIsoDay('not-a-date')).toBeNull()
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

describe('floor quiet helpers', () => {
  const now = new Date('2026-08-25T12:00:00.000Z')

  it('returns null when no passage date is stored', () => {
    expect(floorQuietDays(null, now)).toBeNull()
    expect(isFloorQuiet(null, now)).toBe(false)
  })

  it('treats a 3-day gap as quiet and a 2-day gap as not', () => {
    expect(FLOOR_QUIET_AFTER_DAYS).toBe(3)
    expect(isFloorQuiet('2026-08-22', now)).toBe(true)
    expect(isFloorQuiet('2026-08-23', now)).toBe(false)
    expect(isFloorQuiet('2026-08-25', now)).toBe(false)
    expect(isFloorQuietDays(3)).toBe(true)
    expect(isFloorQuietDays(2)).toBe(false)
    expect(isFloorQuietDays(null)).toBe(false)
  })
})

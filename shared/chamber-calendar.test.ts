import { describe, expect, it } from 'vitest'

import {
  HOUSE_SESSION_RANGES_2026,
  SENATE_NON_LEGISLATIVE_2026,
  isIsoDayInRanges,
  isPublishedSessionDay,
  publishedRecessLabel,
  publishedReturnDay,
} from './chamber-calendar'

describe('2026 chamber calendars', () => {
  it('keeps House session ranges ordered and non-overlapping', () => {
    for (let i = 0; i < HOUSE_SESSION_RANGES_2026.length; i += 1) {
      const range = HOUSE_SESSION_RANGES_2026[i]!
      expect(range.start <= range.end).toBe(true)
      if (i === 0) continue
      expect(HOUSE_SESSION_RANGES_2026[i - 1]!.end < range.start).toBe(true)
    }
  })

  it('keeps Senate out-of-session ranges ordered and non-overlapping', () => {
    for (let i = 0; i < SENATE_NON_LEGISLATIVE_2026.length; i += 1) {
      const range = SENATE_NON_LEGISLATIVE_2026[i]!
      expect(range.start <= range.end).toBe(true)
      if (i === 0) continue
      expect(SENATE_NON_LEGISLATIVE_2026[i - 1]!.end < range.start).toBe(true)
    }
  })
})

describe('publishedReturnDay', () => {
  it('returns House Aug 31 and Senate Sep 14 during the August district work period', () => {
    expect(publishedReturnDay('House', '2026-08-27')).toBe('2026-08-31')
    expect(publishedReturnDay('Senate', '2026-08-27')).toBe('2026-09-14')
    expect(publishedRecessLabel('House', '2026-08-27')).toBe('District work period')
    expect(publishedRecessLabel('Senate', '2026-08-27')).toBe('State work period')
  })

  it('keeps the Senate out through the weekend after its state work period', () => {
    expect(publishedReturnDay('Senate', '2026-09-12')).toBe('2026-09-14')
    expect(publishedReturnDay('Senate', '2026-09-14')).toBeNull()
  })

  it('does not invent a House return on a published session day', () => {
    expect(isPublishedSessionDay('House', '2026-08-31')).toBe(true)
    expect(publishedReturnDay('House', '2026-08-31')).toBeNull()
  })

  it('treats the House Labor Day gap as a district work period back Sep 14', () => {
    expect(isIsoDayInRanges('2026-09-04', HOUSE_SESSION_RANGES_2026)).toBe(false)
    expect(publishedReturnDay('House', '2026-09-04')).toBe('2026-09-14')
  })

  it('does not call a short Senate holiday week a recess', () => {
    expect(publishedReturnDay('Senate', '2026-05-06')).toBeNull()
    expect(publishedRecessLabel('Senate', '2026-05-06')).toBeNull()
  })

  it('returns null outside the 2026 calendars', () => {
    expect(publishedReturnDay('House', '2027-08-27')).toBeNull()
    expect(publishedReturnDay('Senate', 'not-a-date')).toBeNull()
  })
})

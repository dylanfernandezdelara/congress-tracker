import { describe, expect, it } from 'vitest'

import {
  FLOOR_QUIET_AFTER_DAYS,
  FLOOR_RECESS_AFTER_DAYS,
  floorQuietDays,
  floorWorkStatus,
  isFloorQuiet,
  isFloorQuietDays,
  maxIsoDayForChamber,
} from './floor-quiet'

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

  it('labels working, in-session, and recess stretches', () => {
    expect(FLOOR_RECESS_AFTER_DAYS).toBe(7)
    expect(floorWorkStatus('2026-08-24', now)).toBe('working')
    expect(floorWorkStatus('2026-08-22', now)).toBe('in_session')
    expect(floorWorkStatus('2026-08-18', now)).toBe('in_recess')
    expect(floorWorkStatus(null, now)).toBeNull()
  })
})

describe('maxIsoDayForChamber', () => {
  it('keeps House on House dates and lets Senate confirmations count as floor work', () => {
    const dates = {
      house: ['2026-07-23', '2026-04-10'],
      senate: ['2026-08-08'],
      confirmation: ['2026-08-24'],
    }
    expect(maxIsoDayForChamber('House', dates)).toBe('2026-07-23')
    expect(maxIsoDayForChamber('Senate', dates)).toBe('2026-08-24')
    expect(maxIsoDayForChamber(null, dates)).toBe('2026-08-24')
    expect(maxIsoDayForChamber(null, { house: dates.house, senate: dates.senate })).toBe(
      '2026-08-08',
    )
  })
})

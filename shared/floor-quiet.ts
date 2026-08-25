/** Calendar days after the latest passage vote before the floor is treated as quiet. */
export const FLOOR_QUIET_AFTER_DAYS = 3

/** UTC calendar day (`YYYY-MM-DD`) from a date or datetime string; null when invalid. */
export function parseIsoDay(value: string | null | undefined): string | null {
  const day = value?.trim().slice(0, 10) ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/**
 * Whole UTC calendar days from `isoDate` (YYYY-MM-DD) to `now`'s UTC date.
 * Returns null when the date cannot be parsed. Future dates clamp to 0.
 */
export function utcCalendarDaysSince(isoDate: string, now: Date = new Date()): number | null {
  const day = parseIsoDay(isoDate)
  if (!day) return null
  const startMs = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(startMs)) return null
  const nowDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.max(0, Math.round((nowDayMs - startMs) / 86_400_000))
}

/** Days since the latest stored passage vote; null when the date is unknown. */
export function floorQuietDays(
  latestPassageVoteDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!latestPassageVoteDate) return null
  return utcCalendarDaysSince(latestPassageVoteDate, now)
}

/** True when an already-computed quiet-day count meets the floor-quiet threshold. */
export function isFloorQuietDays(
  days: number | null,
  afterDays: number = FLOOR_QUIET_AFTER_DAYS,
): boolean {
  return days !== null && days >= afterDays
}

/** True when the latest passage vote is old enough that a frozen timeline is expected. */
export function isFloorQuiet(
  latestPassageVoteDate: string | null | undefined,
  now: Date = new Date(),
  afterDays: number = FLOOR_QUIET_AFTER_DAYS,
): boolean {
  return isFloorQuietDays(floorQuietDays(latestPassageVoteDate, now), afterDays)
}

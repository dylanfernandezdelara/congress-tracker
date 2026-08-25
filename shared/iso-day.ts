/** UTC calendar day (`YYYY-MM-DD`) from a date or datetime string; null when invalid. */
export function parseIsoDay(value: string | null | undefined): string | null {
  const day = value?.trim().slice(0, 10) ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** Latest valid UTC calendar day among date or datetime strings. */
export function maxIsoDay(
  values: readonly (string | null | undefined)[],
): string | null {
  let latest: string | null = null
  for (const value of values) {
    const day = parseIsoDay(value)
    if (day && (latest === null || day > latest)) latest = day
  }
  return latest
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

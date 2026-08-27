/** UTC calendar day (`YYYY-MM-DD`) from a date or datetime string; null when invalid. */
export function parseIsoDay(value: string | null | undefined): string | null {
  const day = value?.trim().slice(0, 10) ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** UTC calendar day (`YYYY-MM-DD`) for `now`. */
export function utcIsoDay(now: Date = new Date()): string {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Add whole UTC days to a calendar day. Null when `isoDate` is invalid. */
export function addUtcIsoDays(isoDate: string, days: number): string | null {
  const day = parseIsoDay(isoDate)
  if (!day) return null
  const startMs = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(startMs)) return null
  return utcIsoDay(new Date(startMs + days * 86_400_000))
}

/** 0 = Sunday … 6 = Saturday in UTC. Null when the date is invalid. */
export function utcIsoWeekday(isoDate: string): number | null {
  const day = parseIsoDay(isoDate)
  if (!day) return null
  const ms = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).getUTCDay()
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

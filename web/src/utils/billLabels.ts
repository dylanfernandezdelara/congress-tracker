export {
  congressGovBillUrl,
  congressOrdinal,
  formatBillDocket,
  formatBillIdParts,
  formatShortBillId,
} from '@congress-tracker/shared/feed-content'

export function formatVoteDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Whole calendar days from an ISO date (`YYYY-MM-DD`) to `now`. */
export function calendarDaysSince(iso: string, now = new Date()): number | null {
  const day = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const then = new Date(`${day}T12:00:00`)
  if (Number.isNaN(then.getTime())) return null
  const start = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - start) / 86_400_000)
}

export function formatDaysSinceHousePassage(iso: string, now = new Date()): string | null {
  const days = calendarDaysSince(iso, now)
  if (days == null || days < 0) return null
  if (days === 0) return 'House passed today'
  if (days === 1) return '1 day since House passage'
  return `${days} days since House passage`
}

/** `Aug 19`, `Aug 19–24`, `Aug 19 – Sep 2`, or `Jan 10, 2025 – Jan 15, 2026`. */
export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  if (!start) return end ? formatVoteDate(end) : null
  if (!end || end === start) return formatVoteDate(start)
  const startYear = start.slice(0, 4)
  const endYear = end.slice(0, 4)
  if (startYear !== endYear) {
    return `${formatCoverageDate(start)} – ${formatCoverageDate(end)}`
  }
  const first = formatVoteDate(start)
  const last = formatVoteDate(end)
  if (start.slice(0, 7) === end.slice(0, 7)) {
    const lastDay = last.slice(last.lastIndexOf(' ') + 1)
    return `${first}–${lastDay}`
  }
  return `${first} – ${last}`
}

/** UTC weekday + short date for published calendar days (`Monday, Aug 31`). */
export function formatWeekdayVoteDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatCoverageDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

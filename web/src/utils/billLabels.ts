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

/** `Aug 19`, `Aug 19–24`, or `Aug 19 – Sep 2`. */
export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  if (!start) return end ? formatVoteDate(end) : null
  if (!end || end === start) return formatVoteDate(start)
  const first = formatVoteDate(start)
  const last = formatVoteDate(end)
  const firstMonth = first.slice(0, first.lastIndexOf(' '))
  const lastMonth = last.slice(0, last.lastIndexOf(' '))
  if (firstMonth === lastMonth) {
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

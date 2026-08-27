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

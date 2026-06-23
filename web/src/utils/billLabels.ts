export {
  extractUnderlyingBillIdFromTitle,
  formatBillDocket,
  formatShortBillId,
  proceduralHeadline,
  summaryBodyText,
  trimDisplayTitle,
  truncateAtWordBoundary,
  voteIndicatesFailure,
  voteResultClass,
} from '@congress-tracker/shared/feed-content'

export function congressGovBillUrl(congress: number, type: string, number: number): string {
  const seg = type.toLowerCase()
  return `https://www.congress.gov/bill/${congress}th-congress/${seg === 'hr' ? 'house-bill' : seg === 's' ? 'senate-bill' : seg}/${number}`
}

export function formatVoteDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

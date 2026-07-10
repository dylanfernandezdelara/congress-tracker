export {
  extractUnderlyingBillIdFromTitle,
  formatBillDocket,
  formatBillIdParts,
  formatShortBillId,
  getBillTypeTooltip,
  proceduralHeadline,
  summaryBodyText,
  trimDisplayTitle,
  truncateAtWordBoundary,
  voteIndicatesFailure,
} from '@congress-tracker/shared/feed-content'

import { voteResultKind } from '@congress-tracker/shared/vote-result'

/** Map semantic vote outcome to feed CSS utility classes. */
export function voteResultClass(result: string): string {
  const kind = voteResultKind(result)
  if (kind === 'fail') return 'text-fail'
  if (kind === 'pass') return 'text-pass'
  return 'text-faint'
}

export function congressGovBillUrl(congress: number, type: string, number: number): string {
  const seg = type.toLowerCase()
  return `https://www.congress.gov/bill/${congress}th-congress/${seg === 'hr' ? 'house-bill' : seg === 's' ? 'senate-bill' : seg}/${number}`
}

export function formatVoteDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatCoverageDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

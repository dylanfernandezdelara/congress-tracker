import { formatShortBillId } from './billLabels'

/** Display title for a notable vote card / bill sheet. */
export function notableVoteTitle(entry: {
  headline: string | null
  bill_type: string
  bill_number: number
}): string {
  return (
    entry.headline ??
    `${formatShortBillId(entry.bill_type, entry.bill_number)} passage vote`
  )
}

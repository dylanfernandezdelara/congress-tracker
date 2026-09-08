import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'

import type {
  MemberProfileRecentCrossVote,
  MemberProfileResponse,
  MemberProfileSponsoredBill,
} from './types'

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNullableText(value: unknown): string | null {
  const text = asText(value).trim()
  return text.length > 0 ? text : null
}

function deriveBillId(
  billId: unknown,
  congress: unknown,
  billType: unknown,
  billNumber: unknown,
): string {
  if (typeof billId === 'string' && billId.trim()) return billId.trim()
  if (
    typeof congress === 'number' &&
    typeof billType === 'string' &&
    typeof billNumber === 'number'
  ) {
    return formatBillQueryParam({ congress, type: billType, number: billNumber })
  }
  return ''
}

function normalizeCrossVote(raw: MemberProfileRecentCrossVote): MemberProfileRecentCrossVote {
  return {
    ...raw,
    bill_id: deriveBillId(raw.bill_id, raw.bill_congress, raw.bill_type, raw.bill_number),
    title: asText(raw.title),
    headline: asNullableText(raw.headline),
    in_feed: raw.in_feed === true,
  }
}

function normalizeSponsoredBill(raw: MemberProfileSponsoredBill): MemberProfileSponsoredBill {
  return {
    ...raw,
    bill_id: deriveBillId(raw.bill_id, raw.congress, raw.bill_type, raw.bill_number),
    title: asText(raw.title),
    headline: asNullableText(raw.headline),
    latest_action_text: asNullableText(raw.latest_action_text),
    in_feed: raw.in_feed === true,
  }
}

/** Fill missing enrichment fields so a stale cached `/stats/member.json` cannot crash the sheet. */
export function normalizeMemberProfile(raw: MemberProfileResponse): MemberProfileResponse {
  const sponsored_bills = Array.isArray(raw.sponsored_bills)
    ? raw.sponsored_bills.map(normalizeSponsoredBill)
    : []
  const sponsored_bills_total = Number.isFinite(raw.sponsored_bills_total)
    ? Number(raw.sponsored_bills_total)
    : sponsored_bills.length
  const recent_cross_votes = Array.isArray(raw.recent_cross_votes)
    ? raw.recent_cross_votes.map(normalizeCrossVote)
    : []
  return {
    ...raw,
    recent_cross_votes,
    sponsored_bills,
    sponsored_bills_total,
  }
}

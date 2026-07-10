import type { FeedItem, FeedPassageVote } from '../api/types'
import {
  buildFeedSummaryParts,
  extractUnderlyingBillIdFromTitle,
  formatBillDocket,
  formatShortBillId,
  isProceduralVote,
  proceduralHeadline,
  trimDisplayTitle,
  voteIndicatesFailure,
} from '@congress-tracker/shared/feed-content'

export const FEED_SUMMARY_PENDING = 'Summary pending'

export interface FeedSummaryDisplay {
  lead: string
  bullets: string[]
  pending: boolean
}

export type FeedStatusKind = 'passed' | 'failed' | 'procedural' | 'none'

export interface FeedRowMeta {
  kind: FeedStatusKind
  outcomeLabel: string
  chamber: string | null
  margin: string | null
  billId: string
}

type FeedRowView = {
  meta: FeedRowMeta
  eventDisplay: string
}

export function getPrimaryPassageVote(item: FeedItem): FeedPassageVote | null {
  if (item.passage_votes.length === 0) return null

  return item.passage_votes.reduce((latest, vote) =>
    vote.date > latest.date ? vote : latest,
  )
}

export function getFeedRowDisplayDate(item: FeedItem): { iso: string; kind: 'vote' | 'signal' } {
  const signal = item.executive_signals?.[0]
  const signalDate = signal?.posted_at.slice(0, 10)
  const vote = getPrimaryPassageVote(item)
  const activityDate = item.latest_passage_date.slice(0, 10)

  if (signalDate && activityDate === signalDate) {
    return { iso: signalDate, kind: 'signal' }
  }

  if (vote && activityDate === vote.date) {
    return { iso: vote.date, kind: 'vote' }
  }

  return { iso: activityDate, kind: vote ? 'vote' : signalDate ? 'signal' : 'vote' }
}

export function isProceduralFeedItem(item: FeedItem): boolean {
  const vote = getPrimaryPassageVote(item)
  if (!vote) return false
  return isProceduralVote(item.bill.title, vote.question)
}

export function getFeedTopic(item: FeedItem): string {
  if (item.digest?.headline) {
    return trimDisplayTitle(item.digest.headline)
  }

  const title = item.bill.title ?? ''
  const procedural = proceduralHeadline(title)
  if (procedural) return procedural

  if (item.bill.title) {
    return trimDisplayTitle(item.bill.title)
  }

  return formatBillDocket(item.bill.type, item.bill.number, item.bill.congress)
}

function getFeedSummaryParts(item: FeedItem): FeedSummaryDisplay | null {
  const parts = buildFeedSummaryParts({
    whatItDoes: item.digest?.what_it_does,
    keyPoints: item.digest?.key_points,
  })

  if (!parts) return null

  return {
    lead: parts.lead,
    bullets: parts.bullets,
    pending: false,
  }
}

export function getFeedSummaryDisplay(item: FeedItem): FeedSummaryDisplay {
  const parts = getFeedSummaryParts(item)
  if (!parts) {
    return { lead: FEED_SUMMARY_PENDING, bullets: [], pending: true }
  }

  return parts
}

function getProceduralEventSuffix(item: FeedItem): string {
  const title = item.bill.title ?? ''
  const shortBillId = formatShortBillId(item.bill.type, item.bill.number)
  const underlyingBillId = extractUnderlyingBillIdFromTitle(title)

  if (underlyingBillId) {
    return `debate rule for ${underlyingBillId}`
  }

  if (proceduralHeadline(title) !== null) {
    return `rule for ${shortBillId}`
  }

  return `procedural vote on ${shortBillId}`
}

/** Single derivation for collapsed-card meta + event copy. */
function deriveFeedRowView(item: FeedItem): FeedRowView {
  const vote = getPrimaryPassageVote(item)
  const billId = formatShortBillId(item.bill.type, item.bill.number)

  if (!vote) {
    return {
      meta: {
        kind: 'none',
        outcomeLabel: 'No vote',
        chamber: null,
        margin: null,
        billId,
      },
      eventDisplay: 'No vote recorded',
    }
  }

  const margin = `${vote.yeas}–${vote.nays}`
  const procedural = isProceduralFeedItem(item)

  if (procedural) {
    const verb = voteIndicatesFailure(vote.result) ? 'rejected' : 'agreed'
    return {
      meta: {
        kind: 'procedural',
        outcomeLabel: 'Procedural',
        chamber: vote.chamber,
        margin,
        billId,
      },
      eventDisplay: `${vote.chamber} ${verb} ${vote.yeas}–${vote.nays} · ${getProceduralEventSuffix(item)}`,
    }
  }

  const failed = voteIndicatesFailure(vote.result)
  const outcomeLabel = failed ? 'Failed' : 'Passed'
  const kind: FeedStatusKind = failed ? 'failed' : 'passed'

  return {
    meta: {
      kind,
      outcomeLabel,
      chamber: vote.chamber,
      margin,
      billId,
    },
    // Badge/chips already carry outcome + bill; keep the chamber margin line.
    eventDisplay: `${margin} in the ${vote.chamber}`,
  }
}

/** One call for collapsed-card meta + de-duplicated event copy. */
export function getFeedRowView(item: FeedItem): FeedRowView {
  return deriveFeedRowView(item)
}

export function getFeedRowMeta(item: FeedItem): FeedRowMeta {
  return deriveFeedRowView(item).meta
}

/** De-duplicated event copy for the collapsed card (badge/chips already carry outcome + bill). */
export function getFeedEventDisplay(item: FeedItem): string {
  return deriveFeedRowView(item).eventDisplay
}

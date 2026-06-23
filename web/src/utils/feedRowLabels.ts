import type { FeedItem, FeedPassageVote } from '../api/types'
import {
  buildFeedSummaryParts,
  extractUnderlyingBillIdFromTitle,
  formatBillDocket,
  formatShortBillId,
  isProceduralGameVote,
  proceduralHeadline,
  trimDisplayTitle,
  truncateAtWordBoundary,
  voteIndicatesFailure,
} from '@congress-tracker/shared/feed-content'

const TEASER_MAX_CHARS = 120

export const FEED_SUMMARY_PENDING = 'Summary pending'

export interface FeedSummary {
  text: string
  pending: boolean
}

export interface FeedSummaryDisplay {
  lead: string
  bullets: string[]
  pending: boolean
}

export type FeedStatusKind = 'passed' | 'failed' | 'procedural' | 'none'

export interface FeedEventLine {
  outcome: string
  kind: FeedStatusKind
  detail: string
}

export function getPrimaryPassageVote(item: FeedItem): FeedPassageVote | null {
  if (item.passage_votes.length === 0) return null

  return item.passage_votes.reduce((latest, vote) =>
    vote.date > latest.date ? vote : latest,
  )
}

export function isProceduralFeedItem(item: FeedItem): boolean {
  const vote = getPrimaryPassageVote(item)
  if (!vote) return false
  return isProceduralGameVote(item.bill.title, vote.question)
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

function collapseSummaryText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function truncateFeedSummary(text: string): string {
  const collapsed = collapseSummaryText(text)
  if (!collapsed) return collapsed
  return truncateAtWordBoundary(collapsed, TEASER_MAX_CHARS)
}

function getFeedSummaryParts(item: FeedItem): FeedSummaryDisplay | null {
  const parts = buildFeedSummaryParts({
    whatItDoes: item.digest?.what_it_does,
    keyPoints: item.digest?.key_points,
    rawSummaryText: item.raw_summary_text,
  })

  if (!parts) return null

  return {
    lead: parts.lead,
    bullets: parts.bullets,
    pending: false,
  }
}

export function getFeedSummary(item: FeedItem): FeedSummary {
  const parts = getFeedSummaryParts(item)
  if (!parts) {
    return { text: FEED_SUMMARY_PENDING, pending: true }
  }

  const combined = [parts.lead, ...parts.bullets].join(' ')
  return { text: truncateFeedSummary(combined), pending: false }
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

function getSubstantiveOutcomeLabel(result: string): 'Passed' | 'Failed' {
  return voteIndicatesFailure(result) ? 'Failed' : 'Passed'
}

export function getFeedEventLine(item: FeedItem): FeedEventLine {
  const vote = getPrimaryPassageVote(item)
  const billId = formatShortBillId(item.bill.type, item.bill.number)

  if (!vote) {
    return { outcome: 'No vote recorded', kind: 'none', detail: '' }
  }

  if (isProceduralFeedItem(item)) {
    const verb = voteIndicatesFailure(vote.result) ? 'rejected' : 'agreed'
    return {
      outcome: 'Procedural',
      kind: 'procedural',
      detail: `${vote.chamber} ${verb} ${vote.yeas}–${vote.nays} · ${getProceduralEventSuffix(item)}`,
    }
  }

  const outcome = getSubstantiveOutcomeLabel(vote.result)
  return {
    outcome,
    kind: outcome === 'Failed' ? 'failed' : 'passed',
    detail: `${vote.chamber} · ${vote.yeas}–${vote.nays} · ${billId}`,
  }
}

export function formatFeedEventLine(line: FeedEventLine): string {
  return line.detail ? `${line.outcome} · ${line.detail}` : line.outcome
}

export function getFeedStatusKind(item: FeedItem): FeedStatusKind {
  return getFeedEventLine(item).kind
}

export interface FeedRowMeta {
  kind: FeedStatusKind
  outcomeLabel: string
  chamber: string | null
  margin: string | null
  billId: string
}

export function getFeedRowMeta(item: FeedItem): FeedRowMeta {
  const vote = getPrimaryPassageVote(item)
  const billId = formatShortBillId(item.bill.type, item.bill.number)

  if (!vote) {
    return {
      kind: 'none',
      outcomeLabel: 'No vote',
      chamber: null,
      margin: null,
      billId,
    }
  }

  const margin = `${vote.yeas}–${vote.nays}`

  if (isProceduralFeedItem(item)) {
    return {
      kind: 'procedural',
      outcomeLabel: 'Procedural',
      chamber: vote.chamber,
      margin,
      billId,
    }
  }

  const failed = voteIndicatesFailure(vote.result)
  return {
    kind: failed ? 'failed' : 'passed',
    outcomeLabel: failed ? 'Failed' : 'Passed',
    chamber: vote.chamber,
    margin,
    billId,
  }
}

/** De-duplicated event copy for the collapsed card (badge/chips already carry outcome + bill). */
export function getFeedEventDisplay(item: FeedItem): string {
  const meta = getFeedRowMeta(item)
  if (meta.kind === 'none') return 'No vote recorded'
  if (meta.kind === 'procedural') return getFeedEventLine(item).detail
  if (meta.chamber && meta.margin) return `${meta.margin} in the ${meta.chamber}`
  return meta.margin ?? ''
}

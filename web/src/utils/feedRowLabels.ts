import type { FeedItem, FeedPassageVote } from '../api/types'
import {
  formatDigestFailureMessage,
  inferDigestFailureReason,
} from '@congress-tracker/shared/digest-failure'
import {
  buildFeedSummaryParts,
  extractUnderlyingBillIdFromTitle,
  formatBillDocket,
  formatShortBillId,
  isProceduralGameVote,
  proceduralHeadline,
  trimDisplayTitle,
  voteIndicatesFailure,
} from '@congress-tracker/shared/feed-content'

export interface FeedSummary {
  text: string
  failed: boolean
}

export interface FeedSummaryDisplay {
  lead: string
  bullets: string[]
  failed: boolean
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

function getFeedSummaryParts(item: FeedItem): FeedSummaryDisplay | null {
  const failure = getDigestFailureDisplay(item)
  if (failure) return failure

  const parts = buildFeedSummaryParts({
    whatItDoes: item.digest?.what_it_does,
    keyPoints: item.digest?.key_points,
  })

  if (!parts) return null

  return {
    lead: parts.lead,
    bullets: parts.bullets,
    failed: false,
  }
}

function getDigestFailureDisplay(item: FeedItem): FeedSummaryDisplay | null {
  const reason = inferDigestFailureReason(item)
  if (!reason) return null
  return {
    lead: formatDigestFailureMessage(reason),
    bullets: [],
    failed: true,
  }
}

export function getFeedSummary(item: FeedItem): FeedSummary {
  const parts = getFeedSummaryParts(item)
  if (parts) {
    const combined = collapseSummaryText([parts.lead, ...parts.bullets].join(' '))
    return { text: combined, failed: parts.failed }
  }

  return {
    text: formatDigestFailureMessage('openrouter_rewrite_failed'),
    failed: true,
  }
}

export function getFeedSummaryDisplay(item: FeedItem): FeedSummaryDisplay {
  const parts = getFeedSummaryParts(item)
  if (parts) return parts

  return {
    lead: formatDigestFailureMessage('openrouter_rewrite_failed'),
    bullets: [],
    failed: true,
  }
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

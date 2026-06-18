import type { FeedItem, FeedPassageVote } from '../api/types'
import {
  extractUnderlyingBillIdFromTitle,
  formatBillDocket,
  formatShortBillId,
  proceduralHeadline,
  trimDisplayTitle,
  truncateAtWordBoundary,
  voteIndicatesFailure,
} from './billLabels'

const TEASER_MAX_CHARS = 120

const PROCEDURAL_VOTE_QUESTION_PATTERN =
  /cloture|motion to (recommit|table|proceed|discharge)|previous question|point of order|adjourn/i

export type FeedStatusKind = 'passed' | 'failed' | 'procedural' | 'none'

export interface FeedEventLine {
  outcome: string
  kind: FeedStatusKind
  detail: string
}

function isProceduralVoteQuestion(question: string): boolean {
  return PROCEDURAL_VOTE_QUESTION_PATTERN.test(question)
}

export function isProceduralFeedItem(item: FeedItem): boolean {
  const title = item.bill.title ?? ''
  if (proceduralHeadline(title) !== null) return true

  const vote = getPrimaryPassageVote(item)
  if (vote && isProceduralVoteQuestion(vote.question)) return true

  return false
}

export function getPrimaryPassageVote(item: FeedItem): FeedPassageVote | null {
  if (item.passage_votes.length === 0) return null

  return item.passage_votes.reduce((latest, vote) =>
    vote.date > latest.date ? vote : latest,
  )
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

export function getFeedTeaser(item: FeedItem): string | null {
  if (!item.digest?.what_it_does) return null
  const collapsed = item.digest.what_it_does.replace(/\s+/g, ' ').trim()
  return truncateAtWordBoundary(collapsed, TEASER_MAX_CHARS)
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

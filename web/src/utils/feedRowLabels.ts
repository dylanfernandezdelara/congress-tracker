import type { FeedItem, FeedPassageVote } from '../api/types'
import {
  extractUnderlyingBillIdFromTitle,
  formatBillDocket,
  formatShortBillId,
  proceduralHeadline,
  trimDisplayTitle,
  voteIndicatesFailure,
} from './billLabels'

const TEASER_MAX_CHARS = 120

export function isProceduralFeedItem(item: FeedItem): boolean {
  const title = item.bill.title ?? ''
  return proceduralHeadline(title) !== null
}

export function getPrimaryPassageVote(item: FeedItem): FeedPassageVote | null {
  if (item.passage_votes.length === 0) return null

  return item.passage_votes.reduce((latest, vote) =>
    vote.date > latest.date ? vote : latest,
  )
}

export function getFeedTopic(item: FeedItem): string {
  const docket = formatBillDocket(item.bill.type, item.bill.number, item.bill.congress)

  if (item.digest?.headline) {
    return trimDisplayTitle(item.digest.headline)
  }

  const title = item.bill.title ?? ''
  const procedural = proceduralHeadline(title)
  if (procedural) return procedural

  if (item.bill.title) {
    return trimDisplayTitle(item.bill.title)
  }

  return docket
}

function truncateTeaser(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= TEASER_MAX_CHARS) return collapsed

  const slice = collapsed.slice(0, TEASER_MAX_CHARS)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace <= 0) return `${slice.trimEnd()}…`
  return `${slice.slice(0, lastSpace).trimEnd()}…`
}

export function getFeedTeaser(item: FeedItem): string | null {
  if (!item.digest?.what_it_does) return null
  return truncateTeaser(item.digest.what_it_does)
}

function getProceduralEventSuffix(item: FeedItem): string {
  const title = item.bill.title ?? ''
  const underlyingBillId = extractUnderlyingBillIdFromTitle(title)
  if (underlyingBillId) {
    return `debate rule for ${underlyingBillId}`
  }

  return `rule for ${formatShortBillId(item.bill.type, item.bill.number)}`
}

function getSubstantiveOutcomeLabel(result: string): 'Passed' | 'Failed' {
  return voteIndicatesFailure(result) ? 'Failed' : 'Passed'
}

export function getFeedEventLine(item: FeedItem): string {
  const vote = getPrimaryPassageVote(item)
  const billId = formatShortBillId(item.bill.type, item.bill.number)

  if (!vote) {
    return 'No vote recorded'
  }

  if (isProceduralFeedItem(item)) {
    const verb = voteIndicatesFailure(vote.result) ? 'rejected' : 'agreed'
    return `Procedural · ${vote.chamber} ${verb} ${vote.yeas}–${vote.nays} · ${getProceduralEventSuffix(item)}`
  }

  const outcome = getSubstantiveOutcomeLabel(vote.result)
  return `${outcome} · ${vote.chamber} · ${vote.yeas}–${vote.nays} · ${billId}`
}

export function getFeedStatusKind(item: FeedItem): 'passed' | 'failed' | 'procedural' {
  if (isProceduralFeedItem(item)) return 'procedural'

  const vote = getPrimaryPassageVote(item)
  if (!vote) return 'failed'

  return voteIndicatesFailure(vote.result) ? 'failed' : 'passed'
}

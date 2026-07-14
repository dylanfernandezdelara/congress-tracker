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

import {
  deriveTerminalStatus,
  type BillTerminalStatus,
} from './billLifecycleStages'

export const FEED_SUMMARY_PENDING = 'Summary pending'

export interface FeedSummaryDisplay {
  lead: string
  bullets: string[]
  pending: boolean
}

export type FeedStatusKind =
  | 'passed'
  | 'failed'
  | 'procedural'
  | 'none'
  | 'law'
  | 'law_unsigned'
  | 'vetoed'

export interface FeedRowMeta {
  kind: FeedStatusKind
  outcomeLabel: string
  chamber: string | null
  margin: string | null
  billId: string
  /** Compact chip for bills awaiting signature, e.g. "President's desk · day 4/10". */
  presidentDeskChip: string | null
}

type FeedRowView = {
  meta: FeedRowMeta
  eventDisplay: string
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`)
}

function lifecycleBadge(
  status: Exclude<BillTerminalStatus, null | 'pending_signature'>,
): Pick<FeedRowMeta, 'kind' | 'outcomeLabel'> {
  switch (status) {
    case 'became_law_unsigned':
      return { kind: 'law_unsigned', outcomeLabel: 'Law — unsigned' }
    case 'became_law_signed':
      return { kind: 'law', outcomeLabel: 'Law' }
    case 'vetoed':
    case 'pocket_vetoed':
      return { kind: 'vetoed', outcomeLabel: 'Vetoed' }
    default:
      return assertNever(status)
  }
}

function presidentDeskChipLabel(item: FeedItem): string | null {
  const day = item.lifecycle?.derived.day_of_ten
  if (day === null || day === undefined) {
    return "President's desk"
  }
  return `President's desk · day ${day}/10`
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
export function getFeedRowView(item: FeedItem): FeedRowView {
  const vote = getPrimaryPassageVote(item)
  const billId = formatShortBillId(item.bill.type, item.bill.number)
  const terminalStatus = deriveTerminalStatus(item.lifecycle)

  if (!vote) {
    if (
      terminalStatus &&
      terminalStatus !== 'pending_signature'
    ) {
      const badge = lifecycleBadge(terminalStatus)
      return {
        meta: {
          ...badge,
          chamber: null,
          margin: null,
          billId,
          presidentDeskChip: null,
        },
        eventDisplay:
          terminalStatus === 'became_law_unsigned'
            ? "Became law without the President's signature"
            : 'No vote recorded',
      }
    }

    return {
      meta: {
        kind: 'none',
        outcomeLabel: 'No vote',
        chamber: null,
        margin: null,
        billId,
        presidentDeskChip: null,
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
        presidentDeskChip: null,
      },
      eventDisplay: `${vote.chamber} ${verb} ${vote.yeas}–${vote.nays} · ${getProceduralEventSuffix(item)}`,
    }
  }

  if (terminalStatus && terminalStatus !== 'pending_signature') {
    const badge = lifecycleBadge(terminalStatus)
    return {
      meta: {
        ...badge,
        chamber: vote.chamber,
        margin,
        billId,
        presidentDeskChip: null,
      },
      eventDisplay:
        terminalStatus === 'became_law_unsigned'
          ? "Became law without the President's signature"
          : `${margin} in the ${vote.chamber}`,
    }
  }

  const failed = voteIndicatesFailure(vote.result)
  const outcomeLabel = failed ? 'Failed' : 'Passed'
  const kind: FeedStatusKind = failed ? 'failed' : 'passed'
  const deskChip =
    terminalStatus === 'pending_signature' && !failed ? presidentDeskChipLabel(item) : null

  return {
    meta: {
      kind,
      outcomeLabel,
      chamber: vote.chamber,
      margin,
      billId,
      presidentDeskChip: deskChip,
    },
    // Badge/chips already carry outcome + bill; keep the chamber margin line.
    eventDisplay: `${margin} in the ${vote.chamber}`,
  }
}

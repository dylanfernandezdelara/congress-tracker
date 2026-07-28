import type { FeedItem, FeedPassageVote } from '../api/types'
import {
  extractUnderlyingBillIdFromTitle,
  formatBillDocket,
  formatCollapsedDigestLead,
  formatShortBillId,
  isProceduralVote,
  normalizeDigestBullets,
  proceduralHeadline,
  trimDisplayTitle,
  voteIndicatesFailure,
} from '@congress-tracker/shared/feed-content'

import {
  deriveTerminalStatus,
  UNSIGNED_LAW_EVENT,
  type BillTerminalStatus,
} from './billLifecycleStages'
import { TERMINAL_STATUS_PRESENTATION } from './terminalStatusPresentation'

export const FEED_SUMMARY_PENDING = 'Plain-English summary coming soon.'

/** Canonical bill summary for collapsed teasers and expanded detail. */
export interface FeedSummaryContent {
  whatItDoes: string | null
  keyPoints: string[]
  crsSummary: string | null
  pending: boolean
}

export type FeedSummaryPrimary =
  | { kind: 'pending' }
  | { kind: 'what_it_does'; text: string }
  | { kind: 'crs'; text: string }
  | { kind: 'none' }

/** Presentation slots for the expanded detail summary block. */
export interface FeedSummarySectionsModel {
  primary: FeedSummaryPrimary
  keyPoints: string[]
  crsDisclosure: string | null
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

export type FeedRowView = {
  meta: FeedRowMeta
  eventDisplay: string
  /** Extra tone class for the outcome badge (e.g. " text-pass"). */
  badgeToneClass: string
  showMarginChip: boolean
  showEventLine: boolean
  /** Extra tone class for the event line when visible. */
  eventToneClass: string
}

type FeedKindUi = {
  badgeToneClass: string
  eventToneClass: string
  /** When true, show margin chip only if margin text is present. */
  showMarginWhenPresent: boolean
  showEventLine: boolean
}

const FEED_KIND_UI: Record<FeedStatusKind, FeedKindUi> = {
  passed: {
    badgeToneClass: ' text-pass',
    eventToneClass: '',
    showMarginWhenPresent: true,
    showEventLine: false,
  },
  failed: {
    badgeToneClass: ' text-fail',
    eventToneClass: '',
    showMarginWhenPresent: true,
    showEventLine: false,
  },
  vetoed: {
    badgeToneClass: ' text-fail',
    eventToneClass: '',
    showMarginWhenPresent: true,
    showEventLine: false,
  },
  law: {
    badgeToneClass: ' text-law',
    eventToneClass: '',
    showMarginWhenPresent: true,
    showEventLine: false,
  },
  law_unsigned: {
    badgeToneClass: ' text-law',
    eventToneClass: ' feed-row-event--law',
    showMarginWhenPresent: true,
    showEventLine: true,
  },
  procedural: {
    badgeToneClass: '',
    eventToneClass: '',
    showMarginWhenPresent: false,
    showEventLine: true,
  },
  none: {
    badgeToneClass: '',
    eventToneClass: ' feed-row-event--muted',
    showMarginWhenPresent: false,
    showEventLine: true,
  },
}

function withPresentation(meta: FeedRowMeta, eventDisplay: string): FeedRowView {
  const ui = FEED_KIND_UI[meta.kind]
  return {
    meta,
    eventDisplay,
    badgeToneClass: ui.badgeToneClass,
    showMarginChip: ui.showMarginWhenPresent && Boolean(meta.margin),
    showEventLine: ui.showEventLine,
    eventToneClass: ui.eventToneClass,
  }
}

function lifecycleBadge(
  status: Exclude<BillTerminalStatus, null | 'pending_signature'>,
): Pick<FeedRowMeta, 'kind' | 'outcomeLabel'> {
  const presentation = TERMINAL_STATUS_PRESENTATION[status]
  return { kind: presentation.feedKind, outcomeLabel: presentation.chipLabel }
}

function presidentDeskChipLabel(item: FeedItem): string | null {
  const day = item.lifecycle?.derived.day_of_ten
  // day 0 = presented today; the ten-day count starts the following day.
  if (day === null || day === undefined || day === 0) {
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
  // Chronology uses activity (votes + executive). Fall back for older payloads that
  // only sent latest_passage_date; never read null passage as a date string.
  const activityRaw = item.latest_activity_date ?? item.latest_passage_date
  const activityDate = activityRaw?.slice(0, 10) ?? signalDate ?? vote?.date ?? ''

  if (!activityDate) {
    return { iso: '', kind: vote ? 'vote' : signalDate ? 'signal' : 'vote' }
  }

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
  // Full title/headline — never ellipsis-truncate. CSS must not line-clamp.
  if (item.digest?.headline) {
    return trimDisplayTitle(item.digest.headline)
  }

  const title = item.bill.title ?? ''
  const procedural = proceduralHeadline(title)
  if (procedural) return procedural

  if (title) {
    return trimDisplayTitle(title)
  }

  return formatBillDocket(item.bill.type, item.bill.number, item.bill.congress)
}

/** Single source of truth for digest / CRS / pending summary content. */
/** Build canonical summary content from digest / CRS fields (feed or notable). */
export function toFeedSummaryContent(fields: {
  what_it_does?: string | null
  key_points?: string[] | null
  raw_summary_text?: string | null
}): FeedSummaryContent {
  const whatItDoes = fields.what_it_does?.trim() || null
  const keyPoints = normalizeDigestBullets(fields.key_points ?? [])
  const crsSummary = fields.raw_summary_text?.trim() || null

  return {
    whatItDoes,
    keyPoints,
    crsSummary,
    pending: !whatItDoes && keyPoints.length === 0 && !crsSummary,
  }
}

export function getFeedSummaryContent(item: FeedItem): FeedSummaryContent {
  return toFeedSummaryContent({
    what_it_does: item.digest?.what_it_does,
    key_points: item.digest?.key_points,
    raw_summary_text: item.raw_summary_text,
  })
}

/** Short teaser for the collapsed feed row (~25 words, first sentence). */
export function getCollapsedSummaryLead(content: FeedSummaryContent): string {
  if (content.pending) return FEED_SUMMARY_PENDING
  if (content.whatItDoes) return formatCollapsedDigestLead(content.whatItDoes)
  const firstKeyPoint = content.keyPoints[0]
  if (firstKeyPoint) return formatCollapsedDigestLead(firstKeyPoint)
  if (content.crsSummary) return formatCollapsedDigestLead(content.crsSummary)
  return FEED_SUMMARY_PENDING
}

/** Derive primary / key-points / CRS-disclosure slots from canonical content. */
export function getFeedSummarySectionsModel(
  content: FeedSummaryContent,
): FeedSummarySectionsModel {
  if (content.pending) {
    return { primary: { kind: 'pending' }, keyPoints: [], crsDisclosure: null }
  }

  const hasDigestSummary = Boolean(content.whatItDoes) || content.keyPoints.length > 0

  let primary: FeedSummaryPrimary
  let crsDisclosure: string | null = hasDigestSummary ? content.crsSummary : null

  if (content.whatItDoes) {
    primary = { kind: 'what_it_does', text: content.whatItDoes }
  } else if (!hasDigestSummary && content.crsSummary) {
    // Expanded detail shows the full CRS. The collapsed row still uses the
    // ~25-word teaser via getCollapsedSummaryLead — do not re-apply that cap here.
    primary = { kind: 'crs', text: content.crsSummary }
  } else {
    primary = { kind: 'none' }
  }

  return {
    primary,
    keyPoints: content.keyPoints,
    crsDisclosure,
  }
}

/**
 * Suffix after "<Chamber> agreed/rejected Y–N".
 * Returns null when proceduralHeadline already names the underlying bill
 * ("Sets up House debate on H.R. …"), so the event line stays tally-only.
 */
function getProceduralEventSuffix(item: FeedItem): string | null {
  const title = item.bill.title ?? ''
  const shortBillId = formatShortBillId(item.bill.type, item.bill.number)

  if (extractUnderlyingBillIdFromTitle(title)) {
    return null
  }

  if (proceduralHeadline(title) !== null) {
    return `rule for ${shortBillId}`
  }

  return `procedural vote on ${shortBillId}`
}

/** Single derivation for collapsed-card meta + event copy + render flags. */
export function getFeedRowView(item: FeedItem): FeedRowView {
  const vote = getPrimaryPassageVote(item)
  const billId = formatShortBillId(item.bill.type, item.bill.number)
  const terminalStatus = deriveTerminalStatus(item.lifecycle)

  if (!vote) {
    if (terminalStatus && terminalStatus !== 'pending_signature') {
      const badge = lifecycleBadge(terminalStatus)
      return withPresentation(
        {
          ...badge,
          chamber: null,
          margin: null,
          billId,
          presidentDeskChip: null,
        },
        terminalStatus === 'became_law_unsigned' ? UNSIGNED_LAW_EVENT : 'No vote recorded',
      )
    }

    return withPresentation(
      {
        kind: 'none',
        outcomeLabel: 'No vote',
        chamber: null,
        margin: null,
        billId,
        presidentDeskChip: null,
      },
      'No vote recorded',
    )
  }

  const margin = `${vote.yeas}–${vote.nays}`
  const procedural = isProceduralFeedItem(item)

  if (procedural) {
    const verb = voteIndicatesFailure(vote.result) ? 'rejected' : 'agreed'
    const tally = `${vote.chamber} ${verb} ${vote.yeas}–${vote.nays}`
    const suffix = getProceduralEventSuffix(item)
    return withPresentation(
      {
        kind: 'procedural',
        outcomeLabel: 'Procedural',
        chamber: vote.chamber,
        margin,
        billId,
        presidentDeskChip: null,
      },
      suffix ? `${tally} · ${suffix}` : tally,
    )
  }

  if (terminalStatus && terminalStatus !== 'pending_signature') {
    const badge = lifecycleBadge(terminalStatus)
    return withPresentation(
      {
        ...badge,
        chamber: vote.chamber,
        margin,
        billId,
        presidentDeskChip: null,
      },
      terminalStatus === 'became_law_unsigned'
        ? UNSIGNED_LAW_EVENT
        : `${margin} in the ${vote.chamber}`,
    )
  }

  const failed = voteIndicatesFailure(vote.result)
  const outcomeLabel = failed ? 'Failed' : 'Passed'
  const kind: FeedStatusKind = failed ? 'failed' : 'passed'
  const deskChip =
    terminalStatus === 'pending_signature' && !failed ? presidentDeskChipLabel(item) : null

  return withPresentation(
    {
      kind,
      outcomeLabel,
      chamber: vote.chamber,
      margin,
      billId,
      presidentDeskChip: deskChip,
    },
    // Badge/chips already carry outcome + bill; keep the chamber margin line.
    `${margin} in the ${vote.chamber}`,
  )
}

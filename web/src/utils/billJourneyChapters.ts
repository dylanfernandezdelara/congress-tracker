import type { BillProcessActivityKey } from '@congress-tracker/shared/bill-process-labels'
import { shortCommitteeName } from '@congress-tracker/shared/bill-process-labels'
import { cleanVoteQuestion } from '@congress-tracker/shared/vote-question'

import { assertNever } from './assertNever'
import type { BillJourneyCommitteeEvent, BillJourneyEvent } from './billJourney'

export type JourneyChapterId = 'House' | 'Senate' | 'Conference' | 'Other'

export interface JourneyBeat {
  id: string
  date: string | null
  text: string
  failed: boolean
}

export interface JourneyCommitteeRun {
  kind: 'committee'
  id: string
  subject: string
  beats: JourneyBeat[]
  dateStart: string | null
  dateEnd: string | null
}

export interface JourneyStepRun {
  kind: 'step'
  id: string
  beat: JourneyBeat
}

export type JourneyRun = JourneyCommitteeRun | JourneyStepRun

export interface JourneyChapter {
  id: JourneyChapterId
  /** Unique even when the same chamber appears twice (House → Senate → House). */
  key: string
  runs: JourneyRun[]
}

const ACTIVITY_BEAT: Record<BillProcessActivityKey, string> = {
  sent: 'Referred',
  hearings: 'Hearings',
  worked_on: 'Markup',
  advanced: 'Advanced',
  released: 'Discharged',
  interest: 'Noted',
  other: 'Update',
}

function tallySuffix(tally: string | null | undefined): string {
  const trimmed = tally?.trim()
  if (!trimmed) return ''
  return ` ${trimmed.replace(/-/g, '–')}`
}

function committeeFamily(event: BillJourneyCommitteeEvent): string {
  return event.parent_system_code ?? event.system_code ?? event.committee_name
}

function chapterId(event: BillJourneyEvent): JourneyChapterId {
  if (event.kind === 'conference') return 'Conference'
  if (event.chamber === 'House' || event.chamber === 'Senate') return event.chamber
  return 'Other'
}

function shortVoteQuestion(question: string): string {
  const text = cleanVoteQuestion(question)
  if (/agreeing to the resolution/i.test(text)) return 'Rule'
  if (/previous question/i.test(text)) return 'Previous question'
  if (/cloture/i.test(text)) return 'Cloture'
  if (/motion to recommit/i.test(text)) return 'Recommit'
  if (/conference report/i.test(text)) return 'Conference report'
  if (/motion to proceed/i.test(text)) return 'Proceed'
  if (/amendment/i.test(text)) return 'Amendment'
  return text.replace(/^On (the )?/i, '').replace(/\.$/, '') || 'Floor vote'
}

function shortBodyName(name: string): string {
  return shortCommitteeName(name).replace(/\s+Subcommittee$/i, '').trim() || name
}

function committeeBeat(event: BillJourneyCommitteeEvent): JourneyBeat {
  const failed = event.state === 'failed'
  const base = { id: event.id, date: event.date, failed }
  if (event.is_subcommittee) {
    const short = shortBodyName(event.committee_name)
    if (event.activity_key === 'sent') return { ...base, text: short }
    if (event.activity_key === 'advanced') {
      return { ...base, text: `Advanced${tallySuffix(event.tally)} (${short})` }
    }
  }
  return { ...base, text: `${ACTIVITY_BEAT[event.activity_key]}${tallySuffix(event.tally)}` }
}

function committeeSubject(events: BillJourneyCommitteeEvent[]): string | null {
  const parent = events.find((event) => !event.is_subcommittee && event.committee_name)
  const named = parent ?? events.find((event) => event.committee_name)
  if (!named?.committee_name) return null
  return shortCommitteeName(named.committee_name)
}

function floorBeat(event: Exclude<BillJourneyEvent, BillJourneyCommitteeEvent>): JourneyBeat {
  const failed = event.state === 'failed'
  const tally = tallySuffix(event.tally)
  const base = { id: event.id, date: event.date, failed }
  switch (event.kind) {
    case 'calendar':
      return { ...base, text: 'Calendar' }
    case 'considered':
      return { ...base, text: 'Debated' }
    case 'cloture':
      return { ...base, text: `Cloture${tally}` }
    case 'conference':
      return { ...base, text: 'Conference' }
    case 'received':
      return { ...base, text: 'Received' }
    case 'companion_vote':
      return { ...base, text: `${shortVoteQuestion(event.question)}${tally}` }
    case 'passage_vote':
      return { ...base, text: `${failed ? 'Failed' : 'Passed'}${tally}` }
    default:
      return assertNever(event)
  }
}

function dateSpan(events: BillJourneyEvent[]): { dateStart: string | null; dateEnd: string | null } {
  const dates = events.map((event) => event.date).filter((date): date is string => Boolean(date))
  if (dates.length === 0) return { dateStart: null, dateEnd: null }
  return { dateStart: dates[0] ?? null, dateEnd: dates[dates.length - 1] ?? null }
}

function toCommitteeRun(
  events: BillJourneyCommitteeEvent[],
  beats: JourneyBeat[],
): JourneyCommitteeRun | null {
  const kept = beats.filter((beat) => beat.text.trim().length > 0)
  if (kept.length === 0) return null
  const { dateStart, dateEnd } = dateSpan(events)
  return {
    kind: 'committee',
    id: events.map((event) => event.id).join('|'),
    subject: committeeSubject(events) ?? 'Committee',
    beats: kept,
    dateStart,
    dateEnd,
  }
}

function toStepRun(event: BillJourneyEvent, beat: JourneyBeat): JourneyStepRun | null {
  if (!beat.text.trim()) return null
  return { kind: 'step', id: event.id, beat }
}

function isCommittee(event: BillJourneyEvent): event is BillJourneyCommitteeEvent {
  return event.kind === 'committee'
}

function canMerge(pending: BillJourneyEvent[], next: BillJourneyEvent): boolean {
  const first = pending[0]
  if (!first) return false
  return isCommittee(first) && isCommittee(next) && committeeFamily(first) === committeeFamily(next)
}

function finishCommitteeRun(events: BillJourneyCommitteeEvent[]): JourneyCommitteeRun | null {
  const parentAdvanced = events.some(
    (event) => !event.is_subcommittee && event.activity_key === 'advanced',
  )
  const kept = parentAdvanced
    ? events.filter((event) => !(event.is_subcommittee && event.activity_key === 'advanced'))
    : events
  return toCommitteeRun(kept, kept.map(committeeBeat))
}

function finishRun(pending: BillJourneyEvent[]): JourneyRun | null {
  const first = pending[0]
  if (!first) return null
  if (isCommittee(first)) return finishCommitteeRun(pending.filter(isCommittee))
  return toStepRun(first, floorBeat(first))
}

/**
 * Collapse a chronological event list into chamber chapters.
 * Same-committee work becomes one collapsible run of beats;
 * each floor action or vote stays its own step.
 */
export function groupJourneyChapters(events: BillJourneyEvent[]): JourneyChapter[] {
  const chapters: JourneyChapter[] = []
  let pending: BillJourneyEvent[] = []

  const flushPending = () => {
    const chapter = chapters[chapters.length - 1]
    if (!chapter || pending.length === 0) {
      pending = []
      return
    }
    const run = finishRun(pending)
    if (run) chapter.runs.push(run)
    pending = []
  }

  for (const event of events) {
    const id = chapterId(event)
    const current = chapters[chapters.length - 1]
    if (!current || current.id !== id) {
      flushPending()
      chapters.push({ id, key: `${id}-${chapters.length}`, runs: [] })
    } else if (pending.length > 0 && !canMerge(pending, event)) {
      flushPending()
    }
    pending.push(event)
  }
  flushPending()

  return chapters.filter((chapter) => chapter.runs.length > 0)
}

export function journeyChapterLabel(id: JourneyChapterId): string {
  return id === 'Other' ? 'Congress' : id
}

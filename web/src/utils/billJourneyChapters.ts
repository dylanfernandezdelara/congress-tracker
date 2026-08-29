import type { BillProcessActivityKey } from '@congress-tracker/shared/bill-process-labels'
import { shortCommitteeName } from '@congress-tracker/shared/bill-process-labels'

import type { BillJourneyEvent } from './billJourney'

export type JourneyChapterId = 'House' | 'Senate' | 'Conference' | 'Other'

export interface JourneyBeat {
  text: string
  failed: boolean
}

export interface JourneyRun {
  id: string
  subject: string | null
  beats: JourneyBeat[]
  dateStart: string | null
  dateEnd: string | null
}

export interface JourneyChapter {
  id: JourneyChapterId
  runs: JourneyRun[]
}

const ACTIVITY_BEAT: Record<BillProcessActivityKey, string> = {
  sent: 'referred',
  hearings: 'hearings',
  worked_on: 'markup',
  advanced: 'advanced',
  released: 'discharged',
  interest: 'noted',
  other: 'update',
}

function tallySuffix(tally: string | null | undefined): string {
  const trimmed = tally?.trim()
  if (!trimmed) return ''
  return ` ${trimmed.replace(/-/g, '–')}`
}

function committeeFamily(event: BillJourneyEvent): string {
  return event.parent_system_code ?? event.system_code ?? event.committee_name ?? 'committee'
}

function chapterId(event: BillJourneyEvent): JourneyChapterId {
  if (event.kind === 'conference') return 'Conference'
  if (event.chamber === 'House' || event.chamber === 'Senate') return event.chamber
  return 'Other'
}

function shortVoteQuestion(question: string): string {
  const text = question.trim()
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

function committeeBeat(event: BillJourneyEvent): JourneyBeat {
  const failed = event.state === 'failed'
  if (event.is_subcommittee && event.committee_name) {
    const short = shortBodyName(event.committee_name)
    if (event.activity_key === 'sent') return { text: short, failed }
    if (event.activity_key === 'advanced') {
      return { text: `${short} advanced${tallySuffix(event.tally)}`, failed }
    }
  }
  if (event.activity_key) {
    return { text: `${ACTIVITY_BEAT[event.activity_key]}${tallySuffix(event.tally)}`, failed }
  }
  return { text: event.label, failed }
}

function committeeSubject(events: BillJourneyEvent[]): string | null {
  const parent = events.find((event) => !event.is_subcommittee && event.committee_name)
  const named = parent ?? events.find((event) => event.committee_name)
  if (!named?.committee_name) return null
  return shortCommitteeName(named.committee_name)
}

function floorBeat(event: BillJourneyEvent): JourneyBeat {
  const failed = event.state === 'failed'
  const tally = tallySuffix(event.tally)
  switch (event.kind) {
    case 'calendar':
      return { text: 'Calendar', failed }
    case 'considered':
      return { text: 'Debated', failed }
    case 'cloture':
      return { text: `Cloture${tally}`, failed }
    case 'conference':
      return { text: 'Conference', failed }
    case 'received':
      return { text: 'Received', failed }
    case 'companion_vote':
      return { text: `${shortVoteQuestion(event.question ?? event.label)}${tally}`, failed }
    case 'passage_vote':
      return { text: `${failed ? 'Failed' : 'Passed'}${tally}`, failed }
    default:
      return { text: event.label, failed }
  }
}

function dateSpan(events: BillJourneyEvent[]): { dateStart: string | null; dateEnd: string | null } {
  const dates = events.map((event) => event.date).filter((date): date is string => Boolean(date))
  if (dates.length === 0) return { dateStart: null, dateEnd: null }
  return { dateStart: dates[0] ?? null, dateEnd: dates[dates.length - 1] ?? null }
}

function toRun(events: BillJourneyEvent[], subject: string | null, beats: JourneyBeat[]): JourneyRun {
  const { dateStart, dateEnd } = dateSpan(events)
  return {
    id: events.map((event) => event.id).join('|'),
    subject,
    beats: beats.filter((beat) => beat.text.trim().length > 0),
    dateStart,
    dateEnd,
  }
}

function isCommittee(event: BillJourneyEvent): boolean {
  return event.kind === 'committee'
}

function canMerge(pending: BillJourneyEvent[], next: BillJourneyEvent): boolean {
  const first = pending[0]
  if (!first) return true
  if (isCommittee(first) && isCommittee(next)) {
    return committeeFamily(first) === committeeFamily(next)
  }
  return !isCommittee(first) && !isCommittee(next)
}

function finishRun(pending: BillJourneyEvent[]): JourneyRun {
  return isCommittee(pending[0]!) ? toRun(pending, committeeSubject(pending), pending.map(committeeBeat)) : toRun(pending, null, pending.map(floorBeat))
}

/**
 * Collapse a chronological event list into chamber chapters.
 * Same-committee work becomes one line of beats; calendar, rule,
 * and passage share a line instead of repeating kind labels.
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
    chapter.runs.push(finishRun(pending))
    pending = []
  }

  for (const event of events) {
    const id = chapterId(event)
    const current = chapters[chapters.length - 1]
    if (!current || current.id !== id) {
      flushPending()
      chapters.push({ id, runs: [] })
    } else if (pending.length > 0 && !canMerge(pending, event)) {
      flushPending()
    }
    pending.push(event)
  }
  flushPending()

  return chapters.filter((chapter) => chapter.runs.some((run) => run.beats.length > 0))
}

export function journeyChapterLabel(id: JourneyChapterId): string {
  return id === 'Other' ? 'Congress' : id
}

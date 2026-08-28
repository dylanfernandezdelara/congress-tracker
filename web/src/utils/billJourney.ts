import { voteIndicatesFailure } from '@congress-tracker/shared/feed-content'
import type { BillFloorActionKey, BillProcessActivityKey } from '@congress-tracker/shared/bill-process-labels'
import type { FeedChamber, FeedCompanionVote, FeedItem, FeedPassageVote } from '../api/types'
import { getBillLifecycleStages, type BillLifecycleStage } from './billLifecycleStages'

export type BillJourneyKind =
  | 'introduced'
  | 'committee'
  | 'received'
  | 'calendar'
  | 'considered'
  | 'cloture'
  | 'conference'
  | 'companion_vote'
  | 'passage_vote'
  | 'to_president'
  | 'outcome'

export type BillJourneyState = 'done' | 'failed'

export interface BillJourneyEvent {
  id: string
  date: string | null
  kind: BillJourneyKind
  label: string
  detail?: string | null
  chamber: FeedChamber | null
  state: BillJourneyState
  tally: string | null
}

const COMMITTEE_SORT: Record<BillProcessActivityKey, number> = {
  sent: 10,
  hearings: 11,
  worked_on: 12,
  advanced: 13,
  released: 14,
  interest: 15,
  other: 16,
}

const KIND_SORT: Record<BillJourneyKind, number> = {
  introduced: 0,
  committee: 10,
  calendar: 20,
  considered: 21,
  companion_vote: 22,
  cloture: 23,
  passage_vote: 30,
  received: 31,
  conference: 32,
  to_president: 40,
  outcome: 41,
}

const FLOOR_KIND: Record<BillFloorActionKey, BillJourneyKind> = {
  received: 'received',
  calendar: 'calendar',
  considered: 'considered',
  cloture: 'cloture',
  conference: 'conference',
}

function dateKey(date: string | null): string {
  return date ?? ''
}

function eventSort(a: BillJourneyEvent & { sort: number }, b: BillJourneyEvent & { sort: number }): number {
  const byDate = dateKey(a.date).localeCompare(dateKey(b.date))
  if (byDate !== 0) return byDate
  return a.sort - b.sort
}

function voteTally(vote: FeedPassageVote | FeedCompanionVote): string {
  return `${vote.yeas}–${vote.nays}`
}

function passageLabel(vote: FeedPassageVote): string {
  const tally = voteTally(vote)
  if (voteIndicatesFailure(vote.result)) {
    return `Failed in the ${vote.chamber} ${tally}`
  }
  return `Passed the ${vote.chamber} ${tally}`
}

function companionLabel(vote: FeedCompanionVote): string {
  const question = vote.question.trim() || 'Related floor vote'
  return `${vote.chamber} · ${question} · ${vote.result} ${voteTally(vote)}`
}

function isClotureQuestion(question: string): boolean {
  return /cloture/i.test(question)
}

function stageToJourney(
  stage: BillLifecycleStage,
  kind: Extract<BillJourneyKind, 'introduced' | 'to_president' | 'outcome'>,
): (BillJourneyEvent & { sort: number }) | null {
  if (!stage.date) return null
  return {
    id: `${kind}-${stage.date}`,
    date: stage.date,
    kind,
    label: stage.label,
    detail: stage.detail ?? null,
    chamber: null,
    state: stage.state === 'failed' ? 'failed' : 'done',
    tally: null,
    sort: KIND_SORT[kind],
  }
}

/**
 * Chronological path through Congress: committee work, floor actions,
 * related rolls, passage, and presidential milestones.
 */
export function buildBillJourney(item: FeedItem): BillJourneyEvent[] {
  const { stages } = getBillLifecycleStages(item)
  const introduced = stages.find((s) => s.key === 'introduced')
  const toPresident = stages.find((s) => s.key === 'to_president')
  const outcome = stages.find((s) => s.key === 'outcome')

  const rows: Array<BillJourneyEvent & { sort: number }> = []

  const introEvent = introduced ? stageToJourney(introduced, 'introduced') : null
  if (introEvent) rows.push(introEvent)

  for (const [index, stage] of (item.process?.stages ?? []).entries()) {
    rows.push({
      id: `committee-${stage.system_code}-${stage.activity_key}-${stage.date ?? index}`,
      date: stage.date,
      kind: 'committee',
      label: stage.label,
      detail: null,
      chamber: stage.chamber,
      state: 'done',
      tally: stage.tally_text,
      sort: COMMITTEE_SORT[stage.activity_key] ?? KIND_SORT.committee,
    })
  }

  const companionVotes = item.companion_votes ?? []
  const clotureDates = new Set(
    companionVotes.filter((v) => isClotureQuestion(v.question)).map((v) => v.date),
  )

  for (const [index, action] of (item.process?.floor_actions ?? []).entries()) {
    if (action.key === 'cloture' && action.date && clotureDates.has(action.date)) {
      continue
    }
    const kind = FLOOR_KIND[action.key]
    rows.push({
      id: `floor-${action.key}-${action.date ?? index}-${action.chamber ?? 'none'}`,
      date: action.date,
      kind,
      label: action.label,
      detail: null,
      chamber: action.chamber,
      state: 'done',
      tally: action.tally_text,
      sort: KIND_SORT[kind],
    })
  }

  for (const vote of companionVotes) {
    rows.push({
      id: `companion-${vote.chamber}-${vote.congress}-${vote.session}-${vote.roll_number}`,
      date: vote.date,
      kind: isClotureQuestion(vote.question) ? 'cloture' : 'companion_vote',
      label: companionLabel(vote),
      detail: null,
      chamber: vote.chamber,
      state: voteIndicatesFailure(vote.result) ? 'failed' : 'done',
      tally: voteTally(vote),
      sort: isClotureQuestion(vote.question) ? KIND_SORT.cloture : KIND_SORT.companion_vote,
    })
  }

  for (const vote of item.passage_votes) {
    rows.push({
      id: `passage-${vote.chamber}-${vote.congress}-${vote.session}-${vote.roll_number}`,
      date: vote.date,
      kind: 'passage_vote',
      label: passageLabel(vote),
      detail: vote.question,
      chamber: vote.chamber,
      state: voteIndicatesFailure(vote.result) ? 'failed' : 'done',
      tally: voteTally(vote),
      sort: KIND_SORT.passage_vote,
    })
  }

  const presidentEvent = toPresident ? stageToJourney(toPresident, 'to_president') : null
  if (presidentEvent) rows.push(presidentEvent)

  const outcomeEvent = outcome ? stageToJourney(outcome, 'outcome') : null
  if (outcomeEvent) rows.push(outcomeEvent)

  rows.sort(eventSort)
  return rows.map(({ sort: _sort, ...event }) => event)
}

export function journeyKindLabel(kind: BillJourneyKind): string {
  switch (kind) {
    case 'introduced':
      return 'Introduced'
    case 'committee':
      return 'Committee'
    case 'received':
      return 'Received'
    case 'calendar':
      return 'Calendar'
    case 'considered':
      return 'Floor'
    case 'cloture':
      return 'Cloture'
    case 'conference':
      return 'Conference'
    case 'companion_vote':
      return 'Floor vote'
    case 'passage_vote':
      return 'Passage'
    case 'to_president':
      return 'President'
    case 'outcome':
      return 'Law'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

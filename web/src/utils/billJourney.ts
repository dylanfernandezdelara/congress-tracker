import type { BillFloorActionKey, BillProcessActivityKey } from '@congress-tracker/shared/bill-process-labels'
import { voteIndicatesFailure } from '@congress-tracker/shared/feed-content'
import { cleanVoteQuestion } from '@congress-tracker/shared/vote-question'
import type { FeedChamber, FeedCompanionVote, FeedItem, FeedPassageVote } from '../api/types'

export type BillJourneyKind = BillFloorActionKey | 'committee' | 'companion_vote' | 'passage_vote'

export type BillJourneyState = 'done' | 'failed'

export interface BillJourneyEvent {
  id: string
  date: string | null
  kind: BillJourneyKind
  label: string
  chamber: FeedChamber | null
  state: BillJourneyState
  tally: string | null
  activity_key?: BillProcessActivityKey
  committee_name?: string
  system_code?: string
  parent_system_code?: string | null
  is_subcommittee?: boolean
  question?: string
}

const ORIGIN_COMMITTEE_SORT: Record<BillProcessActivityKey, number> = {
  sent: 10,
  hearings: 11,
  worked_on: 12,
  advanced: 13,
  released: 14,
  interest: 15,
  other: 16,
}

const SECOND_CHAMBER_COMMITTEE_SORT = 32

const KIND_SORT: Record<BillJourneyKind, number> = {
  committee: 10,
  calendar: 20,
  considered: 21,
  companion_vote: 22,
  cloture: 23,
  passage_vote: 30,
  received: 31,
  conference: 33,
}

function originChamberFromBillType(billType: string): FeedChamber | null {
  const t = billType.toUpperCase()
  if (t.startsWith('H')) return 'House'
  if (t.startsWith('S')) return 'Senate'
  return null
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
  const question = cleanVoteQuestion(vote.question) || 'Related floor vote'
  return `${vote.chamber} · ${question} · ${vote.result} ${voteTally(vote)}`
}

function isClotureQuestion(question: string): boolean {
  return /cloture/i.test(question)
}

const ROLL_COVERS_FLOOR: Partial<Record<BillFloorActionKey, (question: string) => boolean>> = {
  cloture: isClotureQuestion,
}

function floorCoveredByRoll(
  action: { key: BillFloorActionKey; date: string | null },
  votes: FeedCompanionVote[],
): boolean {
  const matchesQuestion = ROLL_COVERS_FLOOR[action.key]
  if (!matchesQuestion || !action.date) return false
  return votes.some((vote) => matchesQuestion(vote.question) && vote.date === action.date)
}

function committeeSort(origin: FeedChamber | null, chamber: FeedChamber | null, activity: BillProcessActivityKey): number {
  if (origin && chamber && chamber !== origin) return SECOND_CHAMBER_COMMITTEE_SORT
  return ORIGIN_COMMITTEE_SORT[activity] ?? KIND_SORT.committee
}

/**
 * Granular path under the major-stage map: committee work, floor actions,
 * related rolls, and passage tallies. Introduced / president / law stay on
 * the 5-step stepper.
 */
export function buildBillJourney(item: FeedItem): BillJourneyEvent[] {
  const origin = originChamberFromBillType(item.bill.type)
  const rows: Array<BillJourneyEvent & { sort: number }> = []

  for (const [index, stage] of (item.process?.stages ?? []).entries()) {
    rows.push({
      id: `committee-${stage.system_code}-${stage.activity_key}-${stage.date ?? index}`,
      date: stage.date,
      kind: 'committee',
      label: stage.label,
      chamber: stage.chamber,
      state: 'done',
      tally: stage.tally_text,
      activity_key: stage.activity_key,
      committee_name: stage.committee_name,
      system_code: stage.system_code,
      parent_system_code: stage.parent_system_code,
      is_subcommittee: stage.is_subcommittee,
      sort: committeeSort(origin, stage.chamber, stage.activity_key),
    })
  }

  const companionVotes = item.companion_votes ?? []

  for (const [index, action] of (item.process?.floor_actions ?? []).entries()) {
    if (floorCoveredByRoll(action, companionVotes)) continue
    rows.push({
      id: `floor-${action.key}-${action.date ?? index}-${action.chamber ?? 'none'}`,
      date: action.date,
      kind: action.key,
      label: action.label,
      chamber: action.chamber,
      state: 'done',
      tally: action.tally_text,
      sort: KIND_SORT[action.key],
    })
  }

  for (const vote of companionVotes) {
    const kind: BillJourneyKind = isClotureQuestion(vote.question) ? 'cloture' : 'companion_vote'
    rows.push({
      id: `companion-${vote.chamber}-${vote.congress}-${vote.session}-${vote.roll_number}`,
      date: vote.date,
      kind,
      label: companionLabel(vote),
      chamber: vote.chamber,
      state: voteIndicatesFailure(vote.result) ? 'failed' : 'done',
      tally: voteTally(vote),
      question: cleanVoteQuestion(vote.question),
      sort: KIND_SORT[kind],
    })
  }

  for (const vote of item.passage_votes) {
    rows.push({
      id: `passage-${vote.chamber}-${vote.congress}-${vote.session}-${vote.roll_number}`,
      date: vote.date,
      kind: 'passage_vote',
      label: passageLabel(vote),
      chamber: vote.chamber,
      state: voteIndicatesFailure(vote.result) ? 'failed' : 'done',
      tally: voteTally(vote),
      sort: KIND_SORT.passage_vote,
    })
  }

  rows.sort(eventSort)
  return rows.map(({ sort: _sort, ...event }) => event)
}

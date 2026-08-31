import { voteIndicatesFailure } from '@congress-tracker/shared/feed-content'
import type { BillLawKind, BillLifecycle } from '@congress-tracker/shared/lifecycle-api-types'

import type { FeedItem, FeedPassageVote } from '../api/types'
import { assertNever } from './assertNever'
import { TERMINAL_STATUS_PRESENTATION } from './terminalStatusPresentation'

export type BillTerminalStatus =
  | 'became_law_unsigned'
  | 'became_law_signed'
  | 'became_law'
  | 'enacted_over_veto'
  | 'vetoed'
  | 'pocket_vetoed'
  | 'pending_signature'
  | null

export type BillLifecycleStageState = 'done' | 'current' | 'pending' | 'failed'

export type BillLifecycleStageKey =
  | 'introduced'
  | 'house'
  | 'senate'
  | 'to_president'
  | 'outcome'

export interface BillLifecycleStage {
  key: BillLifecycleStageKey
  label: string
  date: string | null
  state: BillLifecycleStageState
  detail?: string
}

export interface BillLifecycleStagesResult {
  terminalStatus: BillTerminalStatus
  stages: BillLifecycleStage[]
}

export function mapLawKind(
  kind: BillLawKind,
):
  | 'became_law_signed'
  | 'became_law_unsigned'
  | 'enacted_over_veto'
  | 'vetoed'
  | 'pocket_vetoed' {
  switch (kind) {
    case 'signed':
      return 'became_law_signed'
    case 'law_unsigned':
      return 'became_law_unsigned'
    case 'enacted_over_veto':
      return 'enacted_over_veto'
    case 'vetoed':
      return 'vetoed'
    case 'pocket_vetoed':
      return 'pocket_vetoed'
    default:
      return assertNever(kind)
  }
}

/** Shared copy for unsigned enactment (collapsed card + pipeline detail). */
export const UNSIGNED_LAW_EVENT =
  "Became law without the President's signature"

export const UNSIGNED_LAW_DETAIL =
  "Enacted without the President's signature (10-day rule)"

/** Day 0 = presented today; the ten-day count starts the following day. */
export function formatTenDayProgress(dayOfTen: number | null | undefined): string {
  if (dayOfTen === null || dayOfTen === undefined) return 'Day — of 10'
  if (dayOfTen === 0) return 'Presented'
  return `Day ${dayOfTen} of 10`
}

/** Formal congress.gov fields win; derived ten-day status is the fallback. */
export function deriveTerminalStatus(lifecycle: BillLifecycle | null | undefined): BillTerminalStatus {
  if (!lifecycle) return null

  if (lifecycle.law_kind) {
    const mapped = mapLawKind(lifecycle.law_kind)
    // A formal enactment date beats a stale veto kind left by an older upsert.
    if (
      lifecycle.became_law_date &&
      (mapped === 'vetoed' || mapped === 'pocket_vetoed')
    ) {
      // fall through to became_law_date handling
    } else {
      return mapped
    }
  }

  if (lifecycle.became_law_date) {
    // Enacted, but the manner (signed vs ten-day lapse) is not asserted upstream.
    return lifecycle.signed_date ? 'became_law_signed' : 'became_law'
  }

  if (lifecycle.signed_date) return 'became_law_signed'
  if (lifecycle.vetoed_date) return 'vetoed'

  const derived = lifecycle.derived.status
  if (derived === 'law_unsigned_derived') return 'became_law_unsigned'
  if (derived === 'pending_signature') return 'pending_signature'
  if (derived === null) return null

  return assertNever(derived)
}

function latestVoteDate(votes: FeedPassageVote[]): string | null {
  if (votes.length === 0) return null
  return votes.reduce((latest, vote) => (vote.date > latest ? vote.date : latest), votes[0]!.date)
}

function chamberPassage(
  votes: FeedPassageVote[],
  chamber: 'House' | 'Senate',
): { date: string | null; state: BillLifecycleStageState } {
  const chamberVotes = votes.filter((vote) => vote.chamber === chamber)
  if (chamberVotes.length === 0) {
    return { date: null, state: 'pending' }
  }

  const passes = chamberVotes.filter((vote) => !voteIndicatesFailure(vote.result))
  if (passes.length > 0) {
    return { date: latestVoteDate(passes), state: 'done' }
  }

  return { date: latestVoteDate(chamberVotes), state: 'failed' }
}

function unsignedLawDate(lifecycle: BillLifecycle): string | null {
  return lifecycle.became_law_date ?? lifecycle.derived.becomes_law_on
}

function formatDeadlineDetail(dayOfTen: number | null, becomesLawOn: string | null): string {
  const dayPart = formatTenDayProgress(dayOfTen)
  if (!becomesLawOn) {
    return `${dayPart} — becomes law if unsigned`
  }
  return `${dayPart} — becomes law ${becomesLawOn} if unsigned`
}

function unsignedDetail(lifecycle: BillLifecycle): string {
  if (lifecycle.public_law) {
    return `${UNSIGNED_LAW_DETAIL} · ${lifecycle.public_law}`
  }
  return UNSIGNED_LAW_DETAIL
}

function outcomeStage(
  terminalStatus: BillTerminalStatus,
  lifecycle: BillLifecycle | null,
): BillLifecycleStage {
  if (terminalStatus === null) {
    return {
      key: 'outcome',
      label: 'Law or veto',
      date: null,
      state: 'pending',
    }
  }

  if (terminalStatus === 'pending_signature') {
    return {
      key: 'outcome',
      label: "On the President's desk",
      date: lifecycle?.presented_date ?? null,
      state: 'current',
      detail: formatDeadlineDetail(
        lifecycle?.derived.day_of_ten ?? null,
        lifecycle?.derived.becomes_law_on ?? null,
      ),
    }
  }

  const presentation = TERMINAL_STATUS_PRESENTATION[terminalStatus]
  const base: BillLifecycleStage = {
    key: 'outcome',
    label: presentation.pipelineLabel,
    date: null,
    state: presentation.feedKind === 'vetoed' ? 'failed' : 'done',
  }

  switch (terminalStatus) {
    case 'became_law_unsigned':
      return {
        ...base,
        date: lifecycle ? unsignedLawDate(lifecycle) : null,
        detail: lifecycle ? unsignedDetail(lifecycle) : undefined,
      }
    case 'became_law_signed':
      return {
        ...base,
        date: lifecycle?.became_law_date ?? lifecycle?.signed_date ?? null,
      }
    case 'became_law':
      return {
        ...base,
        date: lifecycle?.became_law_date ?? null,
        detail: lifecycle?.public_law ? `Public Law ${lifecycle.public_law}` : undefined,
      }
    case 'enacted_over_veto':
      return {
        ...base,
        date: lifecycle?.became_law_date ?? null,
        detail: "Congress overrode the President's veto",
      }
    case 'vetoed':
    case 'pocket_vetoed':
      return {
        ...base,
        date: lifecycle?.vetoed_date ?? null,
      }
    default:
      return assertNever(terminalStatus)
  }
}

function markCurrent(stages: BillLifecycleStage[]): BillLifecycleStage[] {
  if (stages.some((stage) => stage.state === 'current')) {
    return stages
  }

  const firstOpen = stages.findIndex((stage) => stage.state === 'pending')
  if (firstOpen === -1) return stages

  return stages.map((stage, index) =>
    index === firstOpen ? { ...stage, state: 'current' as const } : stage,
  )
}

function originChamberFromBillType(billType: string): 'House' | 'Senate' | null {
  const t = billType.toUpperCase()
  if (t.startsWith('H')) return 'House'
  if (t.startsWith('S')) return 'Senate'
  return null
}

function chamberActed(state: BillLifecycleStageState): boolean {
  return state === 'done' || state === 'failed'
}

/**
 * Keep the 5-step map chronological: the chamber that acted first
 * (or the origin chamber, when neither has) comes before the other.
 * Avoids a filled Senate/House dot after an empty one.
 */
function senateChamberFirst(
  house: { date: string | null; state: BillLifecycleStageState },
  senate: { date: string | null; state: BillLifecycleStageState },
  billType: string,
): boolean {
  if (house.date && senate.date) {
    if (senate.date < house.date) return true
    if (house.date < senate.date) return false
    return originChamberFromBillType(billType) === 'Senate'
  }

  const houseDid = chamberActed(house.state)
  const senateDid = chamberActed(senate.state)
  if (senateDid !== houseDid) return senateDid

  return originChamberFromBillType(billType) === 'Senate'
}

/**
 * Pure derivation of terminal lifecycle status + ordered pipeline stages
 * for the feed row stepper.
 */
export function getBillLifecycleStages(item: FeedItem): BillLifecycleStagesResult {
  const lifecycle = item.lifecycle
  const terminalStatus = deriveTerminalStatus(lifecycle)
  let house = chamberPassage(item.passage_votes, 'House')
  let senate = chamberPassage(item.passage_votes, 'Senate')

  // A bill presented to the President has necessarily passed both chambers;
  // a chamber vote may simply predate the ingest lookback window (including a
  // lookback-only failed vote that would otherwise leave the stage red).
  const reachedPresident = Boolean(lifecycle?.presented_date) || terminalStatus !== null
  if (reachedPresident) {
    if (house.state === 'pending' || house.state === 'failed') {
      house = { ...house, state: 'done' }
    }
    if (senate.state === 'pending' || senate.state === 'failed') {
      senate = { ...senate, state: 'done' }
    }
  }

  const introducedDate = lifecycle?.introduced_date ?? null
  const introducedDone =
    introducedDate !== null ||
    house.state === 'done' ||
    house.state === 'failed' ||
    senate.state === 'done' ||
    senate.state === 'failed' ||
    Boolean(lifecycle?.presented_date) ||
    terminalStatus !== null

  const presentedDate = lifecycle?.presented_date ?? null
  // Any terminal status implies the bill reached the President's desk.
  const toPresidentState: BillLifecycleStageState =
    presentedDate || terminalStatus !== null ? 'done' : 'pending'

  const houseStage: BillLifecycleStage = {
    key: 'house',
    label: 'Passed House',
    date: house.date,
    state: house.state,
  }
  const senateStage: BillLifecycleStage = {
    key: 'senate',
    label: 'Passed Senate',
    date: senate.date,
    state: senate.state,
  }
  const chamberStages = senateChamberFirst(house, senate, item.bill.type)
    ? [senateStage, houseStage]
    : [houseStage, senateStage]

  const stages: BillLifecycleStage[] = [
    {
      key: 'introduced',
      label: 'Introduced',
      date: introducedDate,
      state: introducedDone ? 'done' : 'pending',
    },
    ...chamberStages,
    {
      key: 'to_president',
      label: 'To President',
      date: presentedDate,
      state: toPresidentState,
    },
    outcomeStage(terminalStatus, lifecycle),
  ]

  return {
    terminalStatus,
    stages: markCurrent(stages),
  }
}

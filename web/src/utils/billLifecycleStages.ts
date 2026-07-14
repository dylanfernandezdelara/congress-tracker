import { voteIndicatesFailure } from '@congress-tracker/shared/feed-content'
import type { BillLawKind, BillLifecycle } from '@congress-tracker/shared/lifecycle-api-types'

import type { FeedItem, FeedPassageVote } from '../api/types'

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

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`)
}

function mapLawKind(kind: BillLawKind): Exclude<BillTerminalStatus, null> {
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

/** Formal congress.gov fields win; derived ten-day status is the fallback. */
export function deriveTerminalStatus(lifecycle: BillLifecycle | null | undefined): BillTerminalStatus {
  if (!lifecycle) return null

  if (lifecycle.law_kind) {
    return mapLawKind(lifecycle.law_kind)
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
  const dayPart = dayOfTen === null ? 'Day — of 10' : `Day ${dayOfTen} of 10`
  if (!becomesLawOn) {
    return `${dayPart} — becomes law if unsigned`
  }
  return `${dayPart} — becomes law ${becomesLawOn} if unsigned`
}

function unsignedDetail(lifecycle: BillLifecycle): string {
  const base = "Enacted without the President's signature (10-day rule)"
  if (lifecycle.public_law) {
    return `${base} · ${lifecycle.public_law}`
  }
  return base
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

  switch (terminalStatus) {
    case 'became_law_unsigned':
      return {
        key: 'outcome',
        label: 'Became law — unsigned',
        date: lifecycle ? unsignedLawDate(lifecycle) : null,
        state: 'done',
        detail: lifecycle ? unsignedDetail(lifecycle) : undefined,
      }
    case 'became_law_signed':
      return {
        key: 'outcome',
        label: 'Signed into law',
        date: lifecycle?.became_law_date ?? lifecycle?.signed_date ?? null,
        state: 'done',
      }
    case 'became_law':
      return {
        key: 'outcome',
        label: 'Became law',
        date: lifecycle?.became_law_date ?? null,
        state: 'done',
        detail: lifecycle?.public_law ? `Public Law ${lifecycle.public_law}` : undefined,
      }
    case 'enacted_over_veto':
      return {
        key: 'outcome',
        label: 'Enacted over veto',
        date: lifecycle?.became_law_date ?? null,
        state: 'done',
        detail: "Congress overrode the President's veto",
      }
    case 'vetoed':
      return {
        key: 'outcome',
        label: 'Vetoed',
        date: lifecycle?.vetoed_date ?? null,
        state: 'failed',
      }
    case 'pocket_vetoed':
      return {
        key: 'outcome',
        label: 'Pocket vetoed',
        date: lifecycle?.vetoed_date ?? null,
        state: 'failed',
      }
    case 'pending_signature':
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
  // a chamber vote may simply predate the ingest lookback window.
  const reachedPresident = Boolean(lifecycle?.presented_date) || terminalStatus !== null
  if (reachedPresident) {
    if (house.state === 'pending') house = { ...house, state: 'done' }
    if (senate.state === 'pending') senate = { ...senate, state: 'done' }
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

  const stages: BillLifecycleStage[] = [
    {
      key: 'introduced',
      label: 'Introduced',
      date: introducedDate,
      state: introducedDone ? 'done' : 'pending',
    },
    {
      key: 'house',
      label: 'Passed House',
      date: house.date,
      state: house.state,
    },
    {
      key: 'senate',
      label: 'Passed Senate',
      date: senate.date,
      state: senate.state,
    },
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

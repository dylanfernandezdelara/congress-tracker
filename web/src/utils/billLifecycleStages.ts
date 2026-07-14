import { voteIndicatesFailure } from '@congress-tracker/shared/feed-content'
import type { BillLawKind, BillLifecycle } from '@congress-tracker/shared/lifecycle-api-types'

import type { FeedItem, FeedPassageVote } from '../api/types'

export type BillTerminalStatus =
  | 'became_law_unsigned'
  | 'became_law_signed'
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

function addUtcDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function mapLawKind(kind: BillLawKind): Exclude<BillTerminalStatus, null> {
  switch (kind) {
    case 'signed':
      return 'became_law_signed'
    case 'law_unsigned':
      return 'became_law_unsigned'
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
    return lifecycle.signed_date ? 'became_law_signed' : 'became_law_unsigned'
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
  if (lifecycle.became_law_date) return lifecycle.became_law_date
  if (lifecycle.derived.deadline_date) {
    return addUtcDays(lifecycle.derived.deadline_date, 1)
  }
  return null
}

function formatDeadlineDetail(dayOfTen: number | null, deadlineDate: string | null): string {
  const dayPart = dayOfTen === null ? 'Day — of 10' : `Day ${dayOfTen} of 10`
  if (!deadlineDate) {
    return `${dayPart} — becomes law if unsigned`
  }
  // The ten-day window expires at the end of the deadline day, so the bill is
  // law starting the following day — the same date shown on the outcome stage.
  return `${dayPart} — becomes law ${addUtcDays(deadlineDate, 1)} if unsigned`
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
    case 'became_law_unsigned': {
      const lc = lifecycle!
      return {
        key: 'outcome',
        label: 'Became law — unsigned',
        date: unsignedLawDate(lc),
        state: 'done',
        detail: unsignedDetail(lc),
      }
    }
    case 'became_law_signed':
      return {
        key: 'outcome',
        label: 'Signed into law',
        date: lifecycle?.became_law_date ?? lifecycle?.signed_date ?? null,
        state: 'done',
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
          lifecycle?.derived.deadline_date ?? null,
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
  const bothChambersPassed = house.state === 'done' && senate.state === 'done'
  const pastPresident =
    terminalStatus === 'became_law_unsigned' ||
    terminalStatus === 'became_law_signed' ||
    terminalStatus === 'vetoed' ||
    terminalStatus === 'pocket_vetoed' ||
    terminalStatus === 'pending_signature'

  let toPresidentState: BillLifecycleStageState = 'pending'
  if (presentedDate || pastPresident) {
    toPresidentState = 'done'
  } else if (bothChambersPassed) {
    toPresidentState = 'pending'
  } else if (house.state === 'failed' || senate.state === 'failed') {
    toPresidentState = 'pending'
  }

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

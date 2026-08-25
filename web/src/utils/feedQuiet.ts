import {
  floorWorkStatus,
  isFloorQuiet,
  maxIsoDay,
  maxIsoDayForChamber,
  parseIsoDay,
  type FloorChamber,
  type FloorWorkStatus,
} from '@congress-tracker/shared/floor-quiet'

import { formatVoteDate } from './billLabels'

const FLOOR_STATUS_LABEL = {
  working: 'Working',
  in_session: 'In session',
  in_recess: 'In recess',
} as const satisfies Record<FloorWorkStatus, string>

/** Latest vote-only passage day among feed rows. Ignores executive activity timestamps. */
export function latestPassageDateAmong(
  items: readonly { latest_passage_date: string | null }[],
): string | null {
  return maxIsoDay(items.map((item) => item.latest_passage_date))
}

export function floorActivityDate(params: {
  passageDay?: string | null
  houseLast?: string | null
  senateLast?: string | null
  houseVoteDays?: readonly (string | null | undefined)[]
  senateVoteDays?: readonly (string | null | undefined)[]
  confirmationDates?: readonly (string | null | undefined)[]
  chamber: FloorChamber
}): string | null {
  const fromChamber = maxIsoDayForChamber(params.chamber, {
    house: [params.houseLast, ...(params.houseVoteDays ?? [])],
    senate: [params.senateLast, ...(params.senateVoteDays ?? [])],
    confirmation: params.confirmationDates,
  })
  // Bill-level latest_passage_date is the max across chambers. A House/Senate
  // filter must not fall back to it or a bicameral bill dates the other floor.
  if (params.chamber !== null) return fromChamber
  return fromChamber ?? parseIsoDay(params.passageDay)
}

function voteDaysByChamber(
  items: readonly {
    passage_votes?: readonly { chamber: string; date: string }[]
  }[],
): { house: string[]; senate: string[] } {
  const house: string[] = []
  const senate: string[] = []
  for (const item of items) {
    for (const vote of item.passage_votes ?? []) {
      if (vote.chamber === 'House') house.push(vote.date)
      else if (vote.chamber === 'Senate') senate.push(vote.date)
    }
  }
  return { house, senate }
}

export function floorStatusLabel(
  latestFloorDate: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const status = floorWorkStatus(latestFloorDate, now)
  return status ? FLOOR_STATUS_LABEL[status] : null
}

export function feedQuietCopy(
  latestPassageDate: string | null | undefined,
  now: Date = new Date(),
  chamber: FloorChamber = null,
): { throughLabel: string | null; notice: string | null } {
  const day = parseIsoDay(latestPassageDate)
  if (!day) return { throughLabel: null, notice: null }
  const throughLabel = formatVoteDate(day)
  const who = chamber ?? 'House or Senate'
  const notice = isFloorQuiet(day, now)
    ? `No new ${who} passage votes since ${throughLabel}.`
    : null
  return { throughLabel, notice }
}

/** `session` = chronological timeline; `page` = search / advanced-filter slice. */
export type TimelineThrough = 'session' | 'page'

export function timelineFloorChrome(params: {
  items: readonly {
    latest_passage_date: string | null
    passage_votes?: readonly { chamber: string; date: string }[]
  }[]
  chamber: FloorChamber
  houseLast?: string | null
  senateLast?: string | null
  confirmationVoteDates?: readonly (string | null | undefined)[]
  through?: TimelineThrough
  now?: Date
}): { throughLabel: string | null; notice: string | null; statusLabel: string | null } {
  const now = params.now ?? new Date()
  const through = params.through ?? 'session'
  const pagePassageDay = latestPassageDateAmong(params.items)
  const itemVotes = voteDaysByChamber(params.items)
  const sessionDates = {
    passageDay: pagePassageDay,
    houseLast: params.houseLast,
    senateLast: params.senateLast,
    houseVoteDays: itemVotes.house,
    senateVoteDays: itemVotes.senate,
    chamber: params.chamber,
  }
  const sessionPassageDay = floorActivityDate(sessionDates)
  const activityDay = floorActivityDate({
    ...sessionDates,
    confirmationDates: params.confirmationVoteDates,
  })
  const throughDay = through === 'page' ? pagePassageDay : sessionPassageDay
  const { throughLabel, notice } = feedQuietCopy(throughDay, now, params.chamber)
  return {
    throughLabel,
    notice: through === 'session' ? notice : null,
    statusLabel: floorStatusLabel(activityDay, now),
  }
}

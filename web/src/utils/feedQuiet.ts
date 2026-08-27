import {
  calendarSource,
  publishedRecessLabel,
  publishedReturnDay,
  type CalendarChamber,
} from '@congress-tracker/shared/chamber-calendar'
import {
  floorWorkStatus,
  isFloorQuiet,
  maxIsoDayForChamber,
  type FloorChamber,
  type FloorWorkStatus,
} from '@congress-tracker/shared/floor-quiet'
import { maxIsoDay, parseIsoDay, utcIsoDay } from '@congress-tracker/shared/iso-day'

import { formatVoteDate } from './billLabels'

const FLOOR_STATUS_LABEL = {
  working: 'Working',
  in_session: 'In session',
  in_recess: 'In recess',
} as const satisfies Record<FloorWorkStatus, string>

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
  const day = maxIsoDay([latestPassageDate])
  if (!day) return { throughLabel: null, notice: null }
  const throughLabel = formatVoteDate(day)
  const who = chamber ?? 'House or Senate'
  const notice = isFloorQuiet(day, now)
    ? `No new ${who} passage votes since ${throughLabel}.`
    : null
  return { throughLabel, notice }
}

export type ChamberFloorDetail = {
  chamber: CalendarChamber
  status: FloorWorkStatus | null
  statusLabel: string | null
  lastActivityDay: string | null
  returnsOn: string | null
  periodLabel: string | null
  sourceName: string
  sourceUrl: string
}

export function chamberFloorDetail(
  chamber: CalendarChamber,
  activityDay: string | null | undefined,
  now: Date = new Date(),
): ChamberFloorDetail {
  const status = floorWorkStatus(activityDay, now)
  const onDay = utcIsoDay(now)
  const source = calendarSource(chamber)
  const inRecess = status === 'in_recess'
  return {
    chamber,
    status,
    statusLabel: status ? FLOOR_STATUS_LABEL[status] : null,
    lastActivityDay: parseIsoDay(activityDay),
    returnsOn: inRecess ? publishedReturnDay(chamber, onDay) : null,
    periodLabel: inRecess ? publishedRecessLabel(chamber, onDay) : null,
    sourceName: source.name,
    sourceUrl: source.url,
  }
}

/** `session` = chronological timeline; `page` = search / advanced-filter slice. */
export type TimelineThrough = 'session' | 'page'

export type TimelineFloorChrome = {
  throughLabel: string | null
  notice: string | null
  statusLabel: string | null
  house: ChamberFloorDetail
  senate: ChamberFloorDetail
}

export function timelineFloorChrome(params: {
  items: readonly {
    passage_votes?: readonly { chamber: string; date: string }[]
  }[]
  chamber: FloorChamber
  houseLast?: string | null
  senateLast?: string | null
  confirmationVoteDates?: readonly (string | null | undefined)[]
  through?: TimelineThrough
  now?: Date
}): TimelineFloorChrome {
  const now = params.now ?? new Date()
  const through = params.through ?? 'session'
  const votes = voteDaysByChamber(params.items)
  const sessionPassageDay = maxIsoDayForChamber(params.chamber, {
    house: [params.houseLast],
    senate: [params.senateLast],
  })
  const pagePassageDay = maxIsoDayForChamber(params.chamber, {
    house: votes.house,
    senate: votes.senate,
  })
  const sessionActivityDay = maxIsoDayForChamber(params.chamber, {
    house: [params.houseLast],
    senate: [params.senateLast],
    confirmation: params.confirmationVoteDates,
  })
  const pageActivityDay = maxIsoDayForChamber(params.chamber, {
    house: votes.house,
    senate: votes.senate,
    confirmation: params.confirmationVoteDates,
  })
  const throughDay = through === 'page' ? pagePassageDay : (sessionPassageDay ?? pagePassageDay)
  const activityDay = sessionActivityDay ?? pageActivityDay
  const { throughLabel, notice } = feedQuietCopy(throughDay, now, params.chamber)
  const houseActivity = maxIsoDayForChamber('House', {
    house: [params.houseLast],
    senate: [],
  })
  const senateActivity = maxIsoDayForChamber('Senate', {
    house: [],
    senate: [params.senateLast],
    confirmation: params.confirmationVoteDates,
  })
  return {
    throughLabel,
    notice: through === 'session' ? notice : null,
    statusLabel: floorStatusLabel(activityDay, now),
    house: chamberFloorDetail('House', houseActivity, now),
    senate: chamberFloorDetail('Senate', senateActivity, now),
  }
}

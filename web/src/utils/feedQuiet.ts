import {
  floorWorkStatus,
  isFloorQuiet,
  maxIsoDay,
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
  passageDay: string | null
  houseLast?: string | null
  senateLast?: string | null
  confirmationDates?: readonly (string | null | undefined)[]
  chamber: FloorChamber
}): string | null {
  return maxIsoDayForChamber(params.chamber, {
    house: [params.passageDay, params.houseLast],
    senate: [params.passageDay, params.senateLast],
    confirmation: params.confirmationDates,
  })
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
  items: readonly { latest_passage_date: string | null }[]
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
  const sessionPassageDay = floorActivityDate({
    passageDay: pagePassageDay,
    houseLast: params.houseLast,
    senateLast: params.senateLast,
    chamber: params.chamber,
  })
  const activityDay = floorActivityDate({
    passageDay: pagePassageDay,
    houseLast: params.houseLast,
    senateLast: params.senateLast,
    confirmationDates: params.confirmationVoteDates,
    chamber: params.chamber,
  })
  const throughDay = through === 'page' ? pagePassageDay : sessionPassageDay
  const { throughLabel, notice } = feedQuietCopy(throughDay, now, params.chamber)
  return {
    throughLabel,
    notice: through === 'session' ? notice : null,
    statusLabel: floorStatusLabel(activityDay, now),
  }
}

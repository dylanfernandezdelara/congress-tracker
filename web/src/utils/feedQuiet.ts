import {
  floorWorkStatus,
  isFloorQuiet,
  maxIsoDayForChamber,
  type FloorChamber,
  type FloorWorkStatus,
} from '@congress-tracker/shared/floor-quiet'
import { maxIsoDay } from '@congress-tracker/shared/iso-day'

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
  const votes = voteDaysByChamber(params.items)
  // Unfiltered timelines may still date from bill-level latest_passage_date when
  // the page has no passage_votes. Chamber filters must not — that field is the
  // max across chambers.
  const unfilteredBillDay =
    params.chamber === null
      ? maxIsoDay(params.items.map((item) => item.latest_passage_date))
      : null
  const sessionDates = {
    house: [params.houseLast, ...votes.house],
    senate: [params.senateLast, ...votes.senate],
  }
  const sessionPassageDay =
    maxIsoDayForChamber(params.chamber, sessionDates) ?? unfilteredBillDay
  const pagePassageDay =
    maxIsoDayForChamber(params.chamber, {
      house: votes.house,
      senate: votes.senate,
    }) ?? unfilteredBillDay
  const activityDay =
    maxIsoDayForChamber(params.chamber, {
      ...sessionDates,
      confirmation: params.confirmationVoteDates,
    }) ?? unfilteredBillDay
  const throughDay = through === 'page' ? pagePassageDay : sessionPassageDay
  const { throughLabel, notice } = feedQuietCopy(throughDay, now, params.chamber)
  return {
    throughLabel,
    notice: through === 'session' ? notice : null,
    statusLabel: floorStatusLabel(activityDay, now),
  }
}

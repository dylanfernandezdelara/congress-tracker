import {
  floorWorkStatus,
  isFloorQuiet,
  maxIsoDay,
  parseIsoDay,
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
  confirmationDay?: string | null
  chamber: 'House' | 'Senate' | null
}): string | null {
  switch (params.chamber) {
    case 'House':
      return maxIsoDay([params.passageDay, params.houseLast])
    case 'Senate':
      return maxIsoDay([params.passageDay, params.senateLast, params.confirmationDay])
    case null:
      return maxIsoDay([
        params.passageDay,
        params.houseLast,
        params.senateLast,
        params.confirmationDay,
      ])
    default: {
      const _exhaustive: never = params.chamber
      return _exhaustive
    }
  }
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
  chamber: 'House' | 'Senate' | null = null,
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

export function timelineFloorChrome(params: {
  items: readonly { latest_passage_date: string | null }[]
  chamber: 'House' | 'Senate' | null
  houseLast?: string | null
  senateLast?: string | null
  confirmationVoteDates?: readonly (string | null | undefined)[]
  /** False while searching or using advanced filters so the quiet-floor notice stays off. */
  includeNotice?: boolean
  now?: Date
}): { throughLabel: string | null; notice: string | null; statusLabel: string | null } {
  const now = params.now ?? new Date()
  const includeNotice = params.includeNotice !== false
  const pagePassageDay = latestPassageDateAmong(params.items)
  const confirmationDay = maxIsoDay(params.confirmationVoteDates ?? [])
  const activityDate = (confirmation: string | null) =>
    floorActivityDate({
      passageDay: pagePassageDay,
      houseLast: params.houseLast,
      senateLast: params.senateLast,
      confirmationDay: confirmation,
      chamber: params.chamber,
    })
  // Unfiltered / chamber views use session passage watermarks so page-1
  // executive ranking cannot hide the latest floor vote. Filtered views keep
  // the through-date on the loaded page.
  const passageDay = includeNotice ? activityDate(null) : pagePassageDay
  const { throughLabel, notice } = feedQuietCopy(passageDay, now, params.chamber)
  return {
    throughLabel,
    notice: includeNotice ? notice : null,
    statusLabel: floorStatusLabel(activityDate(confirmationDay), now),
  }
}

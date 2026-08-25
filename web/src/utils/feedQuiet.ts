import {
  floorWorkStatus,
  isFloorQuiet,
  maxIsoDay,
  parseIsoDay,
} from '@congress-tracker/shared/floor-quiet'

import { formatVoteDate } from './billLabels'

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
  if (!status) return null
  switch (status) {
    case 'working':
      return 'Working'
    case 'in_session':
      return 'In session'
    case 'in_recess':
      return 'In recess'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
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
  now?: Date
}): { throughLabel: string | null; notice: string | null; statusLabel: string | null } {
  const now = params.now ?? new Date()
  const passageDay = latestPassageDateAmong(params.items)
  const quietCopy = feedQuietCopy(passageDay, now, params.chamber)
  return {
    ...quietCopy,
    statusLabel: floorStatusLabel(
      floorActivityDate({
        passageDay,
        houseLast: params.houseLast,
        senateLast: params.senateLast,
        confirmationDay: maxIsoDay(params.confirmationVoteDates ?? []),
        chamber: params.chamber,
      }),
      now,
    ),
  }
}

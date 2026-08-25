import { maxIsoDay, utcCalendarDaysSince } from './iso-day'

export { maxIsoDay, parseIsoDay, utcCalendarDaysSince } from './iso-day'

/** Calendar days after the latest passage vote before the floor is treated as quiet. */
export const FLOOR_QUIET_AFTER_DAYS = 3

/**
 * Calendar days with no floor activity before the chambers are treated as in recess
 * (a district work period), not merely between votes.
 */
export const FLOOR_RECESS_AFTER_DAYS = 7

export type FloorWorkStatus = 'working' | 'in_session' | 'in_recess'

export type FloorChamber = 'House' | 'Senate' | null

/**
 * Latest calendar day for the chambers in view. Confirmations are Senate floor
 * work, not passage votes — omit `confirmation` when dating the timeline.
 */
export function maxIsoDayForChamber(
  chamber: FloorChamber,
  dates: {
    house?: readonly (string | null | undefined)[]
    senate?: readonly (string | null | undefined)[]
    confirmation?: readonly (string | null | undefined)[]
  },
): string | null {
  const house = dates.house ?? []
  const senate = dates.senate ?? []
  const confirmation = dates.confirmation ?? []
  switch (chamber) {
    case 'House':
      return maxIsoDay(house)
    case 'Senate':
      return maxIsoDay([...senate, ...confirmation])
    case null:
      return maxIsoDay([...house, ...senate, ...confirmation])
    default: {
      const _exhaustive: never = chamber
      return _exhaustive
    }
  }
}

/** Days since the latest stored passage vote; null when the date is unknown. */
export function floorQuietDays(
  latestPassageVoteDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!latestPassageVoteDate) return null
  return utcCalendarDaysSince(latestPassageVoteDate, now)
}

/** True when an already-computed quiet-day count meets the floor-quiet threshold. */
export function isFloorQuietDays(
  days: number | null,
  afterDays: number = FLOOR_QUIET_AFTER_DAYS,
): boolean {
  return days !== null && days >= afterDays
}

/** True when the latest passage vote is old enough that a frozen timeline is expected. */
export function isFloorQuiet(
  latestPassageVoteDate: string | null | undefined,
  now: Date = new Date(),
  afterDays: number = FLOOR_QUIET_AFTER_DAYS,
): boolean {
  return isFloorQuietDays(floorQuietDays(latestPassageVoteDate, now), afterDays)
}

/**
 * Whether the floor is currently voting, still in session between votes, or
 * in a recess-length quiet stretch. Null when the activity date is unknown.
 */
export function floorWorkStatus(
  latestFloorDate: string | null | undefined,
  now: Date = new Date(),
): FloorWorkStatus | null {
  const days = floorQuietDays(latestFloorDate, now)
  if (days === null) return null
  if (days < FLOOR_QUIET_AFTER_DAYS) return 'working'
  if (days >= FLOOR_RECESS_AFTER_DAYS) return 'in_recess'
  return 'in_session'
}

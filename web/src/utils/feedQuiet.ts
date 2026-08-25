import { FLOOR_QUIET_AFTER_DAYS, utcCalendarDaysSince } from '@congress-tracker/shared/floor-quiet'

import { formatVoteDate } from './billLabels'

export function feedQuietCopy(
  latestActivityDate: string | null | undefined,
  now: Date = new Date(),
): { throughLabel: string | null; notice: string | null } {
  if (!latestActivityDate) return { throughLabel: null, notice: null }
  const throughLabel = formatVoteDate(latestActivityDate)
  const days = utcCalendarDaysSince(latestActivityDate, now)
  const notice =
    days !== null && days >= FLOOR_QUIET_AFTER_DAYS
      ? `No new House or Senate passage votes since ${throughLabel}.`
      : null
  return { throughLabel, notice }
}

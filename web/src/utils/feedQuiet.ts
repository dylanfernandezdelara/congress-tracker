import { isFloorQuiet, parseIsoDay } from '@congress-tracker/shared/floor-quiet'

import { formatVoteDate } from './billLabels'

/** Latest vote-only passage day among feed rows. Ignores executive activity timestamps. */
export function latestPassageDateAmong(
  items: readonly { latest_passage_date: string | null }[],
): string | null {
  let latest: string | null = null
  for (const item of items) {
    const day = parseIsoDay(item.latest_passage_date)
    if (day && (latest === null || day > latest)) latest = day
  }
  return latest
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

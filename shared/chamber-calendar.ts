import { FLOOR_RECESS_AFTER_DAYS } from './floor-quiet'
import {
  addUtcIsoDays,
  parseIsoDay,
  utcCalendarDaysSince,
  utcIsoDay,
  utcIsoWeekday,
} from './iso-day'

export type CalendarChamber = 'House' | 'Senate'

export type IsoDateRange = {
  start: string
  end: string
}

export type LabeledIsoDateRange = IsoDateRange & {
  label: string
}

export type ChamberCalendarSource = {
  year: number
  name: string
  url: string
}

export const HOUSE_CALENDAR_SOURCE: ChamberCalendarSource = {
  year: 2026,
  name: '2026 House Calendar',
  url: 'https://pressgallery.house.gov/schedules/2026-house-calendar',
}

export const SENATE_CALENDAR_SOURCE: ChamberCalendarSource = {
  year: 2026,
  name: 'Senate 2026 legislative schedule',
  url: 'https://www.senate.gov/legislative/2026_schedule.htm',
}

/**
 * Published House legislative days (gold session blocks on the Majority Leader
 * 2026 calendar). Inclusive ranges; adjacent blocks are kept split to match
 * the printed calendar.
 */
export const HOUSE_SESSION_RANGES_2026: readonly IsoDateRange[] = [
  { start: '2026-01-06', end: '2026-01-10' },
  { start: '2026-01-12', end: '2026-01-15' },
  { start: '2026-01-20', end: '2026-01-24' },
  { start: '2026-02-02', end: '2026-02-05' },
  { start: '2026-02-09', end: '2026-02-12' },
  { start: '2026-02-23', end: '2026-02-25' },
  { start: '2026-03-03', end: '2026-03-06' },
  { start: '2026-03-16', end: '2026-03-18' },
  { start: '2026-03-24', end: '2026-03-27' },
  { start: '2026-04-14', end: '2026-04-17' },
  { start: '2026-04-20', end: '2026-04-23' },
  { start: '2026-05-04', end: '2026-05-07' },
  { start: '2026-05-12', end: '2026-05-15' },
  { start: '2026-05-18', end: '2026-05-21' },
  { start: '2026-06-02', end: '2026-06-05' },
  { start: '2026-06-08', end: '2026-06-11' },
  { start: '2026-06-23', end: '2026-06-26' },
  { start: '2026-06-29', end: '2026-07-02' },
  { start: '2026-07-13', end: '2026-07-16' },
  { start: '2026-07-20', end: '2026-07-23' },
  { start: '2026-08-31', end: '2026-09-03' },
  { start: '2026-09-14', end: '2026-09-17' },
  { start: '2026-09-22', end: '2026-09-25' },
  { start: '2026-09-28', end: '2026-10-01' },
  { start: '2026-11-09', end: '2026-11-12' },
  { start: '2026-11-17', end: '2026-11-20' },
  { start: '2026-11-30', end: '2026-12-03' },
  { start: '2026-12-08', end: '2026-12-11' },
  { start: '2026-12-14', end: '2026-12-17' },
]

/**
 * Senate non-legislative periods from the Tentative 2026 Legislative Schedule
 * (days the Senate is not in session). Inclusive ranges.
 */
export const SENATE_NON_LEGISLATIVE_2026: readonly LabeledIsoDateRange[] = [
  { start: '2026-01-01', end: '2026-01-02', label: 'New Year’s Day' },
  { start: '2026-01-19', end: '2026-01-23', label: 'State work period' },
  { start: '2026-02-16', end: '2026-02-20', label: 'Presidents’ Day' },
  { start: '2026-03-30', end: '2026-04-10', label: 'State work period' },
  { start: '2026-05-04', end: '2026-05-08', label: 'State work period' },
  { start: '2026-05-25', end: '2026-05-29', label: 'State work period' },
  { start: '2026-06-19', end: '2026-06-19', label: 'Juneteenth' },
  { start: '2026-06-29', end: '2026-07-10', label: 'State work period' },
  { start: '2026-08-10', end: '2026-09-11', label: 'State work period' },
  { start: '2026-09-21', end: '2026-09-21', label: 'Non-legislative day' },
  { start: '2026-10-05', end: '2026-11-06', label: 'State work period' },
  { start: '2026-11-11', end: '2026-11-13', label: 'Veterans Day' },
  { start: '2026-11-23', end: '2026-11-27', label: 'State work period' },
  { start: '2026-12-21', end: '2026-12-31', label: 'State work period' },
]

export function calendarSource(chamber: CalendarChamber): ChamberCalendarSource {
  return chamber === 'House' ? HOUSE_CALENDAR_SOURCE : SENATE_CALENDAR_SOURCE
}

function dateAtUtcDay(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`)
}

function inclusiveDays(range: IsoDateRange): number {
  const span = utcCalendarDaysSince(range.start, dateAtUtcDay(range.end))
  return span === null ? 0 : span + 1
}

export function isIsoDayInRanges(
  day: string,
  ranges: readonly IsoDateRange[],
): boolean {
  return ranges.some((range) => range.start <= day && day <= range.end)
}

function rangeContaining<T extends IsoDateRange>(
  day: string,
  ranges: readonly T[],
): T | null {
  return ranges.find((range) => range.start <= day && day <= range.end) ?? null
}

function lastRangeEndingBefore<T extends IsoDateRange>(
  day: string,
  ranges: readonly T[],
): T | null {
  let latest: T | null = null
  for (const range of ranges) {
    if (range.end < day && (latest === null || range.end > latest.end)) latest = range
  }
  return latest
}

function firstRangeDayOnOrAfter(
  day: string,
  ranges: readonly IsoDateRange[],
): string | null {
  let best: string | null = null
  for (const range of ranges) {
    if (range.end < day) continue
    const candidate = range.start >= day ? range.start : day
    if (best === null || candidate < best) best = candidate
  }
  return best
}

function lastRangeDayBefore(day: string, ranges: readonly IsoDateRange[]): string | null {
  let latest: string | null = null
  for (const range of ranges) {
    if (range.start >= day) continue
    const candidate = range.end < day ? range.end : addUtcIsoDays(day, -1)
    if (candidate && candidate >= range.start && (latest === null || candidate > latest)) {
      latest = candidate
    }
  }
  return latest
}

function isUtcWeekend(day: string): boolean {
  const weekday = utcIsoWeekday(day)
  return weekday === 0 || weekday === 6
}

function nextSenateLegislativeDayAfter(endInclusive: string): string | null {
  let day = addUtcIsoDays(endInclusive, 1)
  for (let i = 0; i < 21; i += 1) {
    if (!day) return null
    if (!isUtcWeekend(day) && !isIsoDayInRanges(day, SENATE_NON_LEGISLATIVE_2026)) {
      return day
    }
    day = addUtcIsoDays(day, 1)
  }
  return null
}

function longEnoughForRecess(range: IsoDateRange, day: string): boolean {
  if (inclusiveDays(range) >= FLOOR_RECESS_AFTER_DAYS) return true
  const returnsOn = nextSenateLegislativeDayAfter(range.end)
  if (!returnsOn) return false
  const untilReturn = utcCalendarDaysSince(day, dateAtUtcDay(returnsOn))
  return untilReturn !== null && untilReturn >= FLOOR_RECESS_AFTER_DAYS
}

function senateRecessAround(
  day: string,
): { period: LabeledIsoDateRange; returnsOn: string | null } | null {
  const containing = rangeContaining(day, SENATE_NON_LEGISLATIVE_2026)
  if (containing && longEnoughForRecess(containing, day)) {
    return { period: containing, returnsOn: nextSenateLegislativeDayAfter(containing.end) }
  }
  const previous = lastRangeEndingBefore(day, SENATE_NON_LEGISLATIVE_2026)
  if (!previous || !longEnoughForRecess(previous, previous.end)) return null
  const returnsOn = nextSenateLegislativeDayAfter(previous.end)
  if (!returnsOn || day >= returnsOn) return null
  return { period: previous, returnsOn }
}

function houseRecessAround(
  day: string,
): { returnsOn: string | null; label: string } | null {
  if (isIsoDayInRanges(day, HOUSE_SESSION_RANGES_2026)) return null
  const returnsOn = firstRangeDayOnOrAfter(day, HOUSE_SESSION_RANGES_2026)
  const lastSession = lastRangeDayBefore(day, HOUSE_SESSION_RANGES_2026)
  const daysSince = lastSession
    ? utcCalendarDaysSince(lastSession, dateAtUtcDay(day))
    : Number.POSITIVE_INFINITY
  const daysUntil = returnsOn
    ? utcCalendarDaysSince(day, dateAtUtcDay(returnsOn))
    : Number.POSITIVE_INFINITY
  if (
    (daysSince !== null && daysSince >= FLOOR_RECESS_AFTER_DAYS) ||
    (daysUntil !== null && daysUntil >= FLOOR_RECESS_AFTER_DAYS)
  ) {
    return { returnsOn, label: 'District work period' }
  }
  return null
}

export function publishedReturnDay(
  chamber: CalendarChamber,
  onDay: string | null | undefined,
): string | null {
  const day = parseIsoDay(onDay) ?? (onDay ? null : utcIsoDay())
  if (!day || !day.startsWith('2026-')) return null
  if (chamber === 'House') return houseRecessAround(day)?.returnsOn ?? null
  return senateRecessAround(day)?.returnsOn ?? null
}

export function publishedRecessLabel(
  chamber: CalendarChamber,
  onDay: string | null | undefined,
): string | null {
  const day = parseIsoDay(onDay) ?? (onDay ? null : utcIsoDay())
  if (!day || !day.startsWith('2026-')) return null
  if (chamber === 'House') return houseRecessAround(day)?.label ?? null
  return senateRecessAround(day)?.period.label ?? null
}

export function isPublishedSessionDay(
  chamber: CalendarChamber,
  onDay: string | null | undefined,
): boolean {
  const day = parseIsoDay(onDay)
  if (!day || !day.startsWith('2026-')) return false
  if (chamber === 'House') return isIsoDayInRanges(day, HOUSE_SESSION_RANGES_2026)
  return !isUtcWeekend(day) && !isIsoDayInRanges(day, SENATE_NON_LEGISLATIVE_2026)
}

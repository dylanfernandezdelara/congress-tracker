import { FLOOR_RECESS_AFTER_DAYS } from './floor-quiet'
import {
  addUtcIsoDays,
  parseIsoDay,
  utcCalendarDaysBetween,
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

export type PublishedRecess = {
  start: string
  end: string
  returnsOn: string | null
  label: string
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

const CALENDAR_YEAR = '2026'

/**
 * Published House legislative days (gold session blocks on the Majority Leader
 * 2026 calendar). Inclusive ranges.
 */
export const HOUSE_SESSION_RANGES_2026: readonly IsoDateRange[] = [
  { start: '2026-01-06', end: '2026-01-09' },
  { start: '2026-01-12', end: '2026-01-15' },
  { start: '2026-01-20', end: '2026-01-23' },
  { start: '2026-02-02', end: '2026-02-05' },
  { start: '2026-02-09', end: '2026-02-12' },
  { start: '2026-02-23', end: '2026-02-25' },
  { start: '2026-03-03', end: '2026-03-06' },
  { start: '2026-03-16', end: '2026-03-19' },
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

export function isIsoDayInRanges(
  day: string,
  ranges: readonly IsoDateRange[],
): boolean {
  return ranges.some((range) => range.start <= day && day <= range.end)
}

function isUtcWeekend(day: string): boolean {
  const weekday = utcIsoWeekday(day)
  return weekday === 0 || weekday === 6
}

function inCalendarYear(day: string): boolean {
  return day.startsWith(`${CALENDAR_YEAR}-`)
}

function nextSenateLegislativeDayAfter(endInclusive: string): string | null {
  let day = addUtcIsoDays(endInclusive, 1)
  for (let i = 0; i < 21; i += 1) {
    if (!day || !inCalendarYear(day)) return null
    if (!isUtcWeekend(day) && !isIsoDayInRanges(day, SENATE_NON_LEGISLATIVE_2026)) {
      return day
    }
    day = addUtcIsoDays(day, 1)
  }
  return null
}

function recessFromSessionGaps(
  ranges: readonly IsoDateRange[],
  label: string,
): PublishedRecess[] {
  const periods: PublishedRecess[] = []
  for (let i = 0; i < ranges.length - 1; i += 1) {
    const lastSession = ranges[i]!.end
    const nextSession = ranges[i + 1]!.start
    const gap = utcCalendarDaysBetween(lastSession, nextSession)
    if (gap === null || gap < FLOOR_RECESS_AFTER_DAYS) continue
    const start = addUtcIsoDays(lastSession, 1)
    const end = addUtcIsoDays(nextSession, -1)
    if (!start || !end) continue
    periods.push({ start, end, returnsOn: nextSession, label })
  }
  return periods
}

function recessFromNonLegislative(
  ranges: readonly LabeledIsoDateRange[],
): PublishedRecess[] {
  const periods: PublishedRecess[] = []
  for (const range of ranges) {
    const span = utcCalendarDaysBetween(range.start, range.end)
    if (span === null || span + 1 < FLOOR_RECESS_AFTER_DAYS) continue
    const returnsOn = nextSenateLegislativeDayAfter(range.end)
    const end = returnsOn ? addUtcIsoDays(returnsOn, -1) : range.end
    if (!end) continue
    periods.push({ start: range.start, end, returnsOn, label: range.label })
  }
  return periods
}

const HOUSE_RECESS_2026 = recessFromSessionGaps(
  HOUSE_SESSION_RANGES_2026,
  'District work period',
)
const SENATE_RECESS_2026 = recessFromNonLegislative(SENATE_NON_LEGISLATIVE_2026)

function recessTable(chamber: CalendarChamber): readonly PublishedRecess[] {
  return chamber === 'House' ? HOUSE_RECESS_2026 : SENATE_RECESS_2026
}

export function publishedRecess(
  chamber: CalendarChamber,
  onDay: string | null | undefined,
): PublishedRecess | null {
  const day = parseIsoDay(onDay)
  if (!day || !inCalendarYear(day)) return null
  return recessTable(chamber).find((period) => period.start <= day && day <= period.end) ?? null
}

export function publishedReturnDay(
  chamber: CalendarChamber,
  onDay: string | null | undefined,
): string | null {
  return publishedRecess(chamber, onDay)?.returnsOn ?? null
}

export function publishedRecessLabel(
  chamber: CalendarChamber,
  onDay: string | null | undefined,
): string | null {
  return publishedRecess(chamber, onDay)?.label ?? null
}

export function isPublishedSessionDay(
  chamber: CalendarChamber,
  onDay: string | null | undefined,
): boolean {
  const day = parseIsoDay(onDay)
  if (!day || !inCalendarYear(day)) return false
  if (chamber === 'House') return isIsoDayInRanges(day, HOUSE_SESSION_RANGES_2026)
  return !isUtcWeekend(day) && !isIsoDayInRanges(day, SENATE_NON_LEGISLATIVE_2026)
}

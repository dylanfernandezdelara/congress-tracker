export const MAX_HOME_VOTE_AGE_DAYS = 7
const WASHINGTON_TIMEZONE = 'America/New_York'

export function formatCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function formatWashingtonDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: WASHINGTON_TIMEZONE,
  }).format(date)
}

export function formatWashingtonTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: WASHINGTON_TIMEZONE,
  }).format(date)
}

export function localIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dayDistance(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T12:00:00`)
  const to = new Date(`${toDate}T12:00:00`)
  return Math.round((from.getTime() - to.getTime()) / 86_400_000)
}

export function isFreshVoteDate(voteDate: string, todayDate: string): boolean {
  const ageDays = dayDistance(todayDate, voteDate)
  return ageDays >= 0 && ageDays <= MAX_HOME_VOTE_AGE_DAYS
}

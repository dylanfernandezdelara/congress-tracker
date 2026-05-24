import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BriefingFeedItem } from '../api'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { useBriefingFeed } from '../hooks/useBriefingFeed'
import { useE2eLink } from '../hooks/useE2eLink'
import { useE2eMode } from '../hooks/useE2eMode'
import { formatBriefingVoteDate } from '../utils/voteLabels'
import { readHarnessNow } from '../utils/harnessNow'

const MAX_HOME_VOTE_AGE_DAYS = 7
const WASHINGTON_TIMEZONE = 'America/New_York'

function formatCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function formatWashingtonDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: WASHINGTON_TIMEZONE,
  }).format(date)
}

function formatWashingtonTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: WASHINGTON_TIMEZONE,
  }).format(date)
}

function trimSummary(summary: string, maxLength = 360): string {
  if (summary.length <= maxLength) return summary
  return `${summary.slice(0, maxLength).trimEnd()}…`
}

function localIsoDate(date: Date): string {
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

function isFreshVoteDate(voteDate: string, todayDate: string): boolean {
  const ageDays = dayDistance(todayDate, voteDate)
  return ageDays >= 0 && ageDays <= MAX_HOME_VOTE_AGE_DAYS
}

function VoteSummaryRow({ item }: { item: BriefingFeedItem }) {
  const toE2ePath = useE2eLink()

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="document-label text-muted-foreground">{formatBriefingVoteDate(item.vote_date)}</p>
          <h2 className="document-title mt-2 text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            <Link className="transition-colors hover:text-primary" to={toE2ePath(item.detail_path)}>
              {item.title}
            </Link>
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">{trimSummary(item.summary)}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0 self-start">
          <Link to={toE2ePath(item.detail_path)}>Full detail</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export default function Home() {
  const harnessNow = useMemo(
    () => readHarnessNow(window.location.search, window.location.hostname),
    [],
  )
  const { briefing, error, isLoading, usingDemo } = useBriefingFeed()
  const [currentDate, setCurrentDate] = useState(() => harnessNow ?? new Date())
  const [dcNow, setDcNow] = useState(() => harnessNow ?? new Date())
  const e2eMode = useE2eMode()

  useEffect(() => {
    document.title = 'Congress Tracker'
  }, [])

  useEffect(() => {
    if (harnessNow) return
    const intervalId = window.setInterval(() => {
      setCurrentDate((previousDate) => {
        const nextDate = new Date()
        return localIsoDate(previousDate) === localIsoDate(nextDate) ? previousDate : nextDate
      })
    }, 60_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [harnessNow])

  useEffect(() => {
    if (harnessNow) return
    const intervalId = window.setInterval(() => {
      setDcNow(new Date())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [harnessNow])

  const todayDate = useMemo(() => localIsoDate(currentDate), [currentDate])
  const todayLabel = useMemo(() => formatCalendarDate(currentDate), [currentDate])
  const dcTimeLabel = useMemo(() => formatWashingtonTime(dcNow), [dcNow])
  const dcDateLabel = useMemo(() => formatWashingtonDate(dcNow), [dcNow])
  const freshItems = useMemo(
    () => briefing?.items.filter((item) => isFreshVoteDate(item.vote_date, todayDate)) ?? [],
    [briefing, todayDate],
  )

  const displayedItems = useMemo(() => {
    if (freshItems.length > 0) return freshItems
    return briefing?.items ?? []
  }, [freshItems, briefing?.items])

  const showingOlderVotes = freshItems.length === 0 && (briefing?.items.length ?? 0) > 0
  const hasDisplayed = displayedItems.length > 0

  return (
    <div className="flex flex-col gap-4">
      {(usingDemo || e2eMode) && (
        <div className="note-panel border-primary/20 bg-primary/[0.05]">
          <p className="document-label text-primary/80">Review mode</p>
          <p className="mt-2 text-sm leading-6 text-foreground">
            Showing fixture data so the briefing can be reviewed without live ingestion.
          </p>
        </div>
      )}

      {error && (
        <div className="note-panel border-destructive/20 bg-destructive/[0.06]">
          <p className="document-label text-destructive/80">Briefing unavailable</p>
          <p className="mt-2 text-sm leading-6 text-destructive">{error}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading recent Senate votes…</p>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Recent Senate votes">
          <div className="mx-auto flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm leading-5 text-muted-foreground sm:text-base">
            <span>Washington, D.C.</span>
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span className="tabular-nums">{dcTimeLabel}</span>
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span>{dcDateLabel}</span>
          </div>

          {showingOlderVotes && (
            <div className="note-panel mt-2 border-0 bg-muted/35">
              <p className="document-label text-foreground/80">Older votes in the ledger</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                None of these roll calls fall in the last {MAX_HOME_VOTE_AGE_DAYS} calendar days versus today (
                {todayLabel}). Showing the newest available votes from the feed anyway so local development is not
                empty.
              </p>
            </div>
          )}

          {hasDisplayed && (
            <>
              <div className="section-rule">
                <p className="document-kicker">Recent Senate votes</p>
                <h1 className="document-title mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
                  Vote summaries (newest first)
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Plain-language summaries from available bill context; open a vote for tally, party splits, and
                  related history.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {displayedItems.map((item) => (
                  <VoteSummaryRow key={item.id} item={item} />
                ))}
              </div>
            </>
          )}

          {!hasDisplayed && (!briefing || briefing.items.length === 0) && (
            <Card>
              <CardContent className="px-6 py-6">
                <p className="document-kicker">No briefing yet</p>
                <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">No vote summaries yet</h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  The briefing feed has not materialized any vote summaries yet. If you are running the stack locally,
                  start with <code className="rounded bg-muted px-1.5 py-0.5 text-xs">./scripts/dev-all.sh</code> (it
                  ingests when data is missing or stale) or trigger{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/__pipeline/run/ingestion</code>.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  )
}

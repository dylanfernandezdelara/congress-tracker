import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ApiError,
  fetchLatestBriefing,
  type BriefingFeedItem,
  type BriefingFeedResponse,
} from '../api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { E2E_BRIEFING } from '../e2eData'
import { cn } from '../lib/utils'
import { readHarnessNow } from '../utils/harnessNow'

const WASHINGTON_TIMEZONE = 'America/New_York'

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

function formatVoteDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (HTTP ${error.status})`
  if (error instanceof Error) return error.message
  return 'Unexpected fetch error.'
}

function statusLabel(value: 'passed' | 'rejected' | 'in-progress'): string {
  if (value === 'passed') return 'Passed'
  if (value === 'rejected') return 'Rejected'
  return 'In progress'
}

function statusVariant(value: 'passed' | 'rejected' | 'in-progress'): 'success' | 'destructive' | 'secondary' {
  if (value === 'passed') return 'success'
  if (value === 'rejected') return 'destructive'
  return 'secondary'
}

function coverageLabel(value: BriefingFeedResponse['items'][number]['source_coverage']['level']): string {
  if (value === 'full') return 'Full context'
  if (value === 'partial') return 'Partial context'
  return 'Minimal context'
}

function trimSummary(summary: string, maxLength = 260): string {
  if (summary.length <= maxLength) return summary
  return `${summary.slice(0, maxLength).trimEnd()}...`
}

function measureLabel(item: BriefingFeedItem): string {
  return item.bill ? `${item.bill.type} ${item.bill.number}` : `Vote ${item.vote_number}`
}

function voteMargin(item: BriefingFeedItem): number {
  return Math.abs(item.tally.yea - item.tally.nay)
}

function yeaShare(item: BriefingFeedItem): number {
  const total = item.tally.yea + item.tally.nay
  if (total <= 0) return 50
  return (item.tally.yea / total) * 100
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sortChronologically(items: BriefingFeedItem[]): BriefingFeedItem[] {
  return [...items].sort((a, b) => {
    const dateCompare = b.vote_date.localeCompare(a.vote_date)
    if (dateCompare !== 0) return dateCompare
    return b.vote_number - a.vote_number
  })
}

function StatPill({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={cn('note-panel', className)}>
      <p className="document-label">{label}</p>
      <div className="mt-2 text-2xl font-semibold leading-none tabular-nums text-foreground">{value}</div>
    </div>
  )
}

function VoteMeter({ item }: { item: BriefingFeedItem }) {
  const share = yeaShare(item)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-5">
          <div className="text-emerald-950">
            <p className="document-label text-emerald-950/70">Yea</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{item.tally.yea}</p>
          </div>
          <div className="text-rose-900">
            <p className="document-label text-rose-900/70">Nay</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{item.tally.nay}</p>
          </div>
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground tabular-nums">
          {voteMargin(item)}-vote margin
        </p>
      </div>

      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted/55">
        <div className="bg-emerald-950/65" style={{ width: `${share}%` }} />
        <div className="bg-rose-900/55" style={{ width: `${100 - share}%` }} />
      </div>
    </div>
  )
}

function VoteSummaryCard({
  item,
  e2eMode,
}: {
  item: BriefingFeedItem
  e2eMode: boolean
}) {
  return (
    <Card className="border-0">
      <CardContent className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{formatVoteDate(item.vote_date)}</Badge>
            <Badge variant="outline">{measureLabel(item)}</Badge>
            <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
            <Badge variant="outline">{item.category}</Badge>
          </div>

          <h2 className="document-title mt-4 text-3xl font-semibold leading-tight text-foreground">
            <Link
              className="transition-colors hover:text-primary"
              to={e2eMode ? `${item.detail_path}?e2e=1` : item.detail_path}
            >
              {item.title}
            </Link>
          </h2>

          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            {trimSummary(item.summary)}
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StatPill label="Result" value={item.outcome_label} className="md:col-span-2" />
            <StatPill label="Cross-party votes" value={item.crossed_party_lines.length} />
          </div>
        </div>

        <aside className="space-y-4 lg:border-l lg:border-primary/15 lg:pl-5">
          <div className="evidence-block">
            <p className="document-label">Recorded vote</p>
            <div className="mt-3">
              <VoteMeter item={item} />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch">
            <div className="text-sm leading-6 text-muted-foreground">
              <p className="document-label">Source coverage</p>
              <p className="mt-1 text-foreground">{coverageLabel(item.source_coverage.level)}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={e2eMode ? `${item.detail_path}?e2e=1` : item.detail_path}>
                Open vote detail
              </Link>
            </Button>
          </div>
        </aside>
      </CardContent>
    </Card>
  )
}

export default function Home() {
  const harnessNow = useMemo(
    () => readHarnessNow(window.location.search, window.location.hostname),
    [],
  )
  const [briefing, setBriefing] = useState<BriefingFeedResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [usingDemo, setUsingDemo] = useState(false)
  const [currentDate, setCurrentDate] = useState(() => harnessNow ?? new Date())
  const [dcNow, setDcNow] = useState(() => harnessNow ?? new Date())

  const e2eMode = useMemo(
    () => new URLSearchParams(window.location.search).get('e2e') === '1',
    [],
  )

  useEffect(() => {
    document.title = 'Congress Pulse'
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

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)
      setUsingDemo(false)

      if (e2eMode) {
        if (cancelled) return
        setBriefing(E2E_BRIEFING)
        setUsingDemo(true)
        setIsLoading(false)
        return
      }

      try {
        const result = await fetchLatestBriefing()
        if (cancelled) return
        setBriefing(result)
      } catch (err) {
        if (cancelled) return
        setBriefing(null)
        setError(`Live vote summaries unavailable. ${normalizeErrorMessage(err)}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [e2eMode])

  const dcTimeLabel = useMemo(() => formatWashingtonTime(dcNow), [dcNow])
  const dcDateLabel = useMemo(() => formatWashingtonDate(dcNow), [dcNow])
  const todayIso = useMemo(() => localIsoDate(currentDate), [currentDate])
  const chronologicalItems = useMemo(
    () => sortChronologically(briefing?.items ?? []),
    [briefing],
  )
  const latestVoteDate = chronologicalItems[0]?.vote_date ?? null
  const totalCrossovers = chronologicalItems.reduce(
    (sum, item) => sum + item.crossed_party_lines.length,
    0,
  )

  return (
    <div className="flex flex-col gap-4">
      {usingDemo && (
        <div className="note-panel border-primary/20 bg-primary/[0.05]">
          <p className="document-label text-primary/80">Review mode</p>
          <p className="mt-2 text-sm leading-6 text-foreground">
            Showing fixture data so the vote summary page can be reviewed without live ingestion.
          </p>
        </div>
      )}

      {error && (
        <div className="note-panel border-destructive/20 bg-destructive/[0.06]">
          <p className="document-label text-destructive/80">Vote summaries unavailable</p>
          <p className="mt-2 text-sm leading-6 text-destructive">{error}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the latest vote summaries...</p>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Latest congressional vote summaries">
          <div className="mx-auto flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm leading-5 text-muted-foreground sm:text-base">
            <span>Washington, D.C.</span>
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span className="tabular-nums">{dcTimeLabel}</span>
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span>{dcDateLabel}</span>
          </div>

          <Card className="draft-grid border-0">
            <CardContent className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
              <div>
                <p className="document-kicker">Congressional vote summaries</p>
                <h1 className="document-title mt-3 text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
                  Latest votes, newest first
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">
                  Congress Pulse shows the most recent materialized vote records in chronological
                  order, with the vote result, tally, bill marker, source coverage, and cross-party
                  movement up front.
                </p>
              </div>

              <aside className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 lg:border-l lg:border-primary/15 lg:pl-6">
                <StatPill label="Votes shown" value={chronologicalItems.length} />
                <StatPill
                  label="Newest vote"
                  value={latestVoteDate ? formatVoteDate(latestVoteDate) : 'None'}
                />
                <StatPill label="Cross-party votes" value={totalCrossovers} />
              </aside>
            </CardContent>
          </Card>

          {briefing?.coverage_note && (
            <div className="note-panel border-primary/20 bg-primary/[0.05]">
              <p className="document-label text-primary/80">Coverage note</p>
              <p className="mt-2 text-sm leading-6 text-foreground">{briefing.coverage_note}</p>
            </div>
          )}

          {chronologicalItems.length > 0 ? (
            <section className="flex flex-col gap-4" aria-label="Chronological vote list">
              <div className="section-rule">
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                  <h2 className="document-title text-2xl font-semibold text-foreground sm:text-3xl">
                    Vote summaries
                  </h2>
                  <p className="max-w-xl text-sm text-muted-foreground sm:text-right">
                    Materialized from cached worker data on {todayIso}. No ranking applied.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                {chronologicalItems.map((item) => (
                  <VoteSummaryCard key={item.id} item={item} e2eMode={e2eMode} />
                ))}
              </div>
            </section>
          ) : (
            <Card>
              <CardContent className="px-6 py-6">
                <p className="document-kicker">No vote summaries yet</p>
                <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">
                  No materialized votes available
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  The briefing endpoint has not materialized any vote items yet.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  )
}

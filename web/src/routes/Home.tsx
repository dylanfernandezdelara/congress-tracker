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
import { Separator } from '../components/ui/separator'
import { E2E_BRIEFING } from '../e2eData'
import { cn } from '../lib/utils'

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

function formatVoteDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (HTTP ${error.status})`
  if (error instanceof Error) return error.message
  return 'Unexpected fetch error.'
}

function significanceLabel(value: 'high' | 'medium' | 'low'): string {
  if (value === 'high') return 'High impact'
  if (value === 'medium') return 'Medium impact'
  return 'Lower impact'
}

function significanceVariant(value: 'high' | 'medium' | 'low'): 'destructive' | 'secondary' | 'default' {
  if (value === 'high') return 'destructive'
  if (value === 'medium') return 'secondary'
  return 'default'
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

function trimSummary(summary: string, maxLength = 220): string {
  if (summary.length <= maxLength) return summary
  return `${summary.slice(0, maxLength).trimEnd()}...`
}

function trimLine(summary: string, maxLength = 140): string {
  if (summary.length <= maxLength) return summary
  return `${summary.slice(0, maxLength).trimEnd()}...`
}

function crossoverHeadline(count: number): string {
  if (count === 0) return 'No crossover votes'
  if (count === 1) return '1 crossover vote'
  return `${count} crossover votes`
}

function crossoverSummary(item: BriefingFeedItem): string {
  if (item.crossed_party_lines.length === 0) {
    return 'The vote held on party lines.'
  }

  const labels = item.crossed_party_lines
    .slice(0, 2)
    .map((crossover) => `${crossover.name} (${crossover.party}-${crossover.state})`)
  const suffix =
    item.crossed_party_lines.length > 2 ? ` +${item.crossed_party_lines.length - 2} more` : ''

  return `${labels.join(', ')}${suffix}`
}

function measureLabel(item: BriefingFeedItem): string {
  return item.bill ? `${item.bill.type} ${item.bill.number}` : `Vote ${item.vote_number}`
}

function voteMargin(item: BriefingFeedItem): number {
  return Math.abs(item.tally.yea - item.tally.nay)
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

function latestVoteDate(items: BriefingFeedItem[]): string | null {
  if (items.length === 0) return null
  return items.reduce((latest, item) => (item.vote_date > latest ? item.vote_date : latest), items[0].vote_date)
}

function yeaShare(item: BriefingFeedItem): number {
  const total = item.tally.yea + item.tally.nay
  if (total <= 0) return 50
  return (item.tally.yea / total) * 100
}

function FactBlock({
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
      <div className="mt-2 text-sm leading-6 text-foreground">{value}</div>
    </div>
  )
}

function EvidencePanel({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('evidence-block', className)}>
      <p className="document-label">{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function TallyMeter({
  item,
  compact = false,
}: {
  item: BriefingFeedItem
  compact?: boolean
}) {
  const share = yeaShare(item)

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className={cn('flex gap-4', compact ? 'text-sm' : 'text-base')}>
          <div className="text-emerald-950">
            <p className="document-label text-emerald-950/70">Yea</p>
            <p className={cn('mt-1 font-semibold tabular-nums', compact ? 'text-xl' : 'text-3xl')}>
              {item.tally.yea}
            </p>
          </div>
          <div className="text-rose-900">
            <p className="document-label text-rose-900/70">Nay</p>
            <p className={cn('mt-1 font-semibold tabular-nums', compact ? 'text-xl' : 'text-3xl')}>
              {item.tally.nay}
            </p>
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

function LeadVoteCard({
  item,
  e2eMode,
}: {
  item: BriefingFeedItem
  e2eMode: boolean
}) {
  return (
    <Card className="draft-grid border-0">
      <CardContent className="grid gap-6 px-6 py-6 lg:px-8 lg:py-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="document-kicker">Lead vote</p>
            <span className="document-label text-primary/70">Rank 01</span>
            <span className="document-label text-primary/70">{formatVoteDate(item.vote_date)}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={significanceVariant(item.significance)}>
              {significanceLabel(item.significance)}
            </Badge>
            <Badge variant="outline">{item.category}</Badge>
            <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
          </div>

          <h2 className="document-title mt-5 text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            <Link
              className="transition-colors hover:text-primary"
              to={e2eMode ? `${item.detail_path}?e2e=1` : item.detail_path}
            >
              {item.title}
            </Link>
          </h2>

          <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground">
            {trimSummary(item.summary, 320)}
          </p>

          <div className="note-panel mt-6 border-primary/20 bg-primary/[0.045]">
            <p className="document-label">What happened</p>
            <p className="mt-2 text-base leading-7 text-foreground">{item.outcome_label}</p>
          </div>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="document-label">Why it rose to the top</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.ranking_reasons.slice(0, 3).map((reason) => (
                  <Badge key={reason.code} variant="muted" className="normal-case tracking-normal">
                    {reason.label}
                  </Badge>
                ))}
              </div>
            </div>

            <Button asChild size="sm" variant="outline">
              <Link to={e2eMode ? `${item.detail_path}?e2e=1` : item.detail_path}>
                Open dossier
              </Link>
            </Button>
          </div>
        </div>

        <aside className="space-y-3 xl:border-l xl:border-primary/15 xl:pl-6">
          <EvidencePanel label="Recorded vote" className="border-emerald-950/10 bg-emerald-950/[0.04]">
            <TallyMeter item={item} />
          </EvidencePanel>

          <EvidencePanel
            label="Cross-party signal"
            className={
              item.crossed_party_lines.length > 0
                ? 'border-primary/20 bg-primary/[0.05]'
                : 'border-border/70 bg-background/72'
            }
          >
            <p className="text-lg font-semibold text-foreground">
              {crossoverHeadline(item.crossed_party_lines.length)}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{crossoverSummary(item)}</p>
          </EvidencePanel>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <FactBlock label="File marker" value={measureLabel(item)} />
            <FactBlock label="Source coverage" value={coverageLabel(item.source_coverage.level)} />
          </div>
        </aside>
      </CardContent>
    </Card>
  )
}

function SecondaryVoteCard({
  item,
  rank,
  e2eMode,
}: {
  item: BriefingFeedItem
  rank: number
  e2eMode: boolean
}) {
  return (
    <Card className="border-0">
      <CardContent className="grid gap-0 px-0 pb-0 pt-0 md:grid-cols-[72px_minmax(0,1fr)]">
        <div className="border-b border-border/70 bg-muted/30 px-4 py-4 md:border-b-0 md:border-r">
          <p className="document-label">Rank</p>
          <p className="document-title mt-2 text-3xl font-semibold text-foreground tabular-nums">
            {String(rank).padStart(2, '0')}
          </p>
        </div>

        <div className="px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={significanceVariant(item.significance)}>
                {significanceLabel(item.significance)}
              </Badge>
              <Badge variant="outline">{item.category}</Badge>
              <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
            </div>
            <span className="document-label text-primary/75">{formatVoteDate(item.vote_date)}</span>
          </div>

          <h3 className="document-title mt-4 text-[1.8rem] font-semibold leading-tight text-foreground">
            <Link
              className="transition-colors hover:text-primary"
              to={e2eMode ? `${item.detail_path}?e2e=1` : item.detail_path}
            >
              {item.title}
            </Link>
          </h3>

          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            {trimLine(item.summary)}
          </p>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-3">
              <div className="note-panel">
                <p className="document-label">What happened</p>
                <p className="mt-2 text-sm leading-6 text-foreground">{item.outcome_label}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {item.ranking_reasons.slice(0, 2).map((reason) => (
                  <Badge key={reason.code} variant="muted" className="normal-case tracking-normal">
                    {reason.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="evidence-block">
              <p className="document-label">Quick read</p>
              <div className="mt-3 space-y-3">
                <TallyMeter item={item} compact />
                <div className="text-sm leading-6 text-muted-foreground">
                  <p className="font-medium text-foreground">{crossoverHeadline(item.crossed_party_lines.length)}</p>
                  <p>{crossoverSummary(item)}</p>
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="document-label">File markers</p>
              <p className="text-sm leading-6 text-foreground">
                {measureLabel(item)} <span className="text-muted-foreground">/</span>{' '}
                <span className="text-muted-foreground">
                  {coverageLabel(item.source_coverage.level)}
                </span>
              </p>
            </div>

            <Button asChild size="sm" variant="outline">
              <Link to={e2eMode ? `${item.detail_path}?e2e=1` : item.detail_path}>
                Open dossier
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Home() {
  const [briefing, setBriefing] = useState<BriefingFeedResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [usingDemo, setUsingDemo] = useState(false)
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [dcNow, setDcNow] = useState(() => new Date())

  const e2eMode = useMemo(
    () => new URLSearchParams(window.location.search).get('e2e') === '1',
    [],
  )

  useEffect(() => {
    document.title = 'Senate Pulse'
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDate((previousDate) => {
        const nextDate = new Date()
        return localIsoDate(previousDate) === localIsoDate(nextDate) ? previousDate : nextDate
      })
    }, 60_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDcNow(new Date())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

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
        setError(`Live briefing unavailable. ${normalizeErrorMessage(err)}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [e2eMode])

  const todayDate = useMemo(() => localIsoDate(currentDate), [currentDate])
  const todayLabel = useMemo(() => formatCalendarDate(currentDate), [currentDate])
  const dcTimeLabel = useMemo(() => formatWashingtonTime(dcNow), [dcNow])
  const dcDateLabel = useMemo(() => formatWashingtonDate(dcNow), [dcNow])
  const freshItems = useMemo(
    () => briefing?.items.filter((item) => isFreshVoteDate(item.vote_date, todayDate)) ?? [],
    [briefing, todayDate],
  )
  const latestAvailableVoteDate = useMemo(
    () => latestVoteDate(briefing?.items ?? []),
    [briefing],
  )
  const hasFreshItems = freshItems.length > 0
  const leadItem = hasFreshItems ? freshItems[0] : null
  const secondaryItems = hasFreshItems ? freshItems.slice(1) : []

  return (
    <div className="flex flex-col gap-4">
      {usingDemo && (
        <div className="note-panel border-primary/20 bg-primary/[0.05]">
          <p className="document-label text-primary/80">Review mode</p>
          <p className="mt-2 text-sm leading-6 text-foreground">
            Showing fixture data so the redesigned briefing can be reviewed without live ingestion.
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
        <p className="text-sm text-muted-foreground">Loading the latest ranked briefing...</p>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Latest Senate briefing">
          <div className="mx-auto flex items-center gap-2 text-sm leading-5 text-muted-foreground sm:text-base">
            <span>Washington, D.C.</span>
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span className="tabular-nums">{dcTimeLabel}</span>
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-foreground/70" />
            <span>{dcDateLabel}</span>
          </div>

          {!hasFreshItems && latestAvailableVoteDate && (
            <div className="note-panel mt-2 border-0 bg-primary/[0.045]">
              <p className="document-label text-primary/80">No current briefing to promote</p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                The newest vote currently available in this feed is from{' '}
                {formatVoteDate(latestAvailableVoteDate)}. Older votes are not surfaced as the lead
                item for {todayLabel}.
              </p>
            </div>
          )}

          {leadItem && (
            <>
              <div className="mt-2">
                <LeadVoteCard item={leadItem} e2eMode={e2eMode} />
              </div>

              {secondaryItems.length > 0 && (
                <section className="flex flex-col gap-4" aria-label="Additional votes in the briefing">
                  <div className="section-rule">
                    <p className="document-kicker">Also in today’s briefing</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <h2 className="document-title text-2xl font-semibold text-foreground sm:text-3xl">
                        Remaining watchlist
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Lower-ranked than the lead item, but still worth tracking.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {secondaryItems.map((item, index) => (
                      <SecondaryVoteCard
                        key={item.id}
                        item={item}
                        rank={index + 2}
                        e2eMode={e2eMode}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {!leadItem && (!briefing || briefing.items.length === 0) && (
            <Card>
              <CardContent className="px-6 py-6">
                <p className="document-kicker">No briefing yet</p>
                <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">
                  No ranked votes available yet
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  The new briefing endpoint has not materialized any vote items yet.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  )
}

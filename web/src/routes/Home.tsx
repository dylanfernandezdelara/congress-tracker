import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, fetchLatestBriefing, type BriefingFeedResponse } from '../api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
import { E2E_BRIEFING } from '../e2eData'

function formatToday(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
  if (value === 'passed') return 'PASSED'
  if (value === 'rejected') return 'REJECTED'
  return 'IN PROGRESS'
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

function trimSummary(summary: string, maxLength = 180): string {
  if (summary.length <= maxLength) return summary
  return `${summary.slice(0, maxLength).trimEnd()}...`
}

function crossoverHeadline(count: number): string {
  if (count === 0) return 'No crossover votes'
  if (count === 1) return '1 crossover vote'
  return `${count} crossover votes`
}

function crossoverSummary(item: BriefingFeedResponse['items'][number]): string {
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

function metaPillClass(): string {
  return 'rounded-full border border-border/80 bg-white/75 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm'
}

export default function Home() {
  const [briefing, setBriefing] = useState<BriefingFeedResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [usingDemo, setUsingDemo] = useState(false)

  const e2eMode = useMemo(
    () => new URLSearchParams(window.location.search).get('e2e') === '1',
    [],
  )

  useEffect(() => {
    document.title = 'Senate Pulse'
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

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden border-border/70 bg-[linear-gradient(145deg,rgba(255,253,248,0.97),rgba(245,238,226,0.96))]">
        <CardContent className="relative px-6 py-6 sm:px-8">
          <div className="absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-[0.2em] text-primary">Senate Pulse</span>
              <span>{formatToday()}</span>
            </div>

            <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <h1 className="font-serif text-3xl tracking-tight text-balance text-foreground sm:text-4xl">
                  Ranked vote feed
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  The Senate votes most worth your attention, ranked from official records by
                  consequence, cross-party behavior, and recency.
                </p>
              </div>

              {briefing && (
                <div className="flex flex-wrap gap-2 xl:max-w-md xl:justify-end">
                  <span className={metaPillClass()}>Updated {formatTimestamp(briefing.generated_at)}</span>
                  <span className={metaPillClass()}>Source: {briefing.source.toUpperCase()}</span>
                  <span className={metaPillClass()}>{briefing.items.length} votes in view</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {usingDemo && (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-primary">
          Showing fixture data so the redesigned briefing can be reviewed without live ingestion.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the latest ranked briefing...</p>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Latest Senate briefing">
          <div className="flex flex-col gap-1">
            <h2 className="font-serif text-2xl text-foreground">Most relevant votes</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Priority goes to substantive votes, major offices, and unusual cross-party breaks.
              Thin procedural votes are pushed down unless they clearly matter.
            </p>
          </div>

          {briefing && briefing.items.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {briefing.items.map((item, index) => (
                <Card
                  key={item.id}
                  className="border-border/80 bg-white/90 transition-transform hover:-translate-y-0.5"
                >
                  <CardContent className="px-5 py-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/8 text-sm font-semibold tracking-[0.16em] text-primary">
                        {String(index + 1).padStart(2, '0')}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={significanceVariant(item.significance)}>
                              {significanceLabel(item.significance)}
                            </Badge>
                            <Badge variant="outline">{item.category}</Badge>
                            <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                          </div>
                          <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            {formatVoteDate(item.vote_date)}
                          </span>
                        </div>

                        <h3 className="mt-3 font-serif text-xl leading-tight text-foreground sm:text-[1.35rem]">
                          <Link
                            className="transition-colors hover:text-primary"
                            to={e2eMode ? `${item.detail_path}?e2e=1` : item.detail_path}
                          >
                            {item.title}
                          </Link>
                        </h3>
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-stone-700 sm:text-[0.95rem]">
                      {trimSummary(item.summary)}
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-emerald-800/10 bg-emerald-50/70 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900/80">
                          Recorded vote
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <div className="rounded-full bg-emerald-700/10 px-3 py-2 text-emerald-900">
                            <strong className="mr-1 text-lg">{item.tally.yea}</strong>
                            <span className="text-xs font-semibold tracking-[0.16em]">YEA</span>
                          </div>
                          <div className="rounded-full bg-rose-700/10 px-3 py-2 text-rose-900">
                            <strong className="mr-1 text-lg">{item.tally.nay}</strong>
                            <span className="text-xs font-semibold tracking-[0.16em]">NAY</span>
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-stone-600">
                          {Math.abs(item.tally.yea - item.tally.nay)}-vote margin
                        </p>
                      </div>

                      <div
                        className={`rounded-2xl border p-4 ${
                          item.crossed_party_lines.length > 0
                            ? 'border-primary/15 bg-primary/5'
                            : 'border-border/70 bg-stone-50/75'
                        }`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Cross-party signal
                        </p>
                        <p className="mt-3 text-base font-semibold text-foreground">
                          {crossoverHeadline(item.crossed_party_lines.length)}
                        </p>
                        <p className="mt-2 text-sm leading-5 text-muted-foreground">
                          {crossoverSummary(item)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.ranking_reasons.slice(0, 2).map((reason) => (
                        <Badge key={reason.code} variant="muted" className="normal-case tracking-normal">
                          {reason.label}
                        </Badge>
                      ))}
                    </div>

                    <Separator className="my-4" />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        <span>{item.bill ? `${item.bill.type} ${item.bill.number}` : `Vote ${item.vote_number}`}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {coverageLabel(item.source_coverage.level)}
                        </Badge>
                      </div>

                      <Button asChild size="sm" variant="outline">
                        <Link to={e2eMode ? `${item.detail_path}?e2e=1` : item.detail_path}>
                          View detail
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-white/90">
              <CardContent className="px-6 py-6">
                <h3 className="font-serif text-2xl text-foreground">No ranked votes available yet</h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
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

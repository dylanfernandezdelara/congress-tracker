import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, fetchVoteDetail, type VoteDetailResponse } from '../api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
import { E2E_VOTE_DETAILS } from '../e2eData'

function formatVoteDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (HTTP ${error.status})`
  if (error instanceof Error) return error.message
  return 'Unexpected fetch error.'
}

function prettyParty(value: string): string {
  if (value === 'D') return 'Democrats'
  if (value === 'R') return 'Republicans'
  if (value === 'I') return 'Independents'
  return value
}

function statusLabel(value: 'passed' | 'rejected' | 'in-progress'): string {
  if (value === 'passed') return 'PASSED'
  if (value === 'rejected') return 'REJECTED'
  return 'IN PROGRESS'
}

function coverageLabel(value: VoteDetailResponse['source_coverage']['level']): string {
  if (value === 'full') return 'Full context'
  if (value === 'partial') return 'Partial context'
  return 'Minimal context'
}

function prettyStepType(value: string): string {
  return value.split('_').join(' ')
}

function confidenceVariant(value: 'high' | 'medium' | 'low'): 'success' | 'secondary' | 'destructive' {
  if (value === 'high') return 'success'
  if (value === 'medium') return 'secondary'
  return 'destructive'
}

export default function VoteDetail() {
  const params = useParams()
  const [detail, setDetail] = useState<VoteDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const e2eMode = useMemo(
    () => new URLSearchParams(window.location.search).get('e2e') === '1',
    [],
  )

  useEffect(() => {
    if (!detail) {
      document.title = 'Senate Pulse'
      return
    }
    document.title = `${detail.vote.title} | Senate Pulse`
  }, [detail])

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)

      const { congress, session, voteNumber } = params
      if (!congress || !session || !voteNumber) {
        setError('Missing vote identifier.')
        setIsLoading(false)
        return
      }

      if (e2eMode) {
        const fixture = E2E_VOTE_DETAILS[`${congress}:${session}:${voteNumber}`]
        if (!cancelled) {
          setDetail(fixture ?? null)
          setError(fixture ? null : 'No fixture detail exists for this vote.')
          setIsLoading(false)
        }
        return
      }

      try {
        const result = await fetchVoteDetail(congress, session, voteNumber)
        if (cancelled) return
        setDetail(result)
      } catch (err) {
        if (cancelled) return
        setDetail(null)
        setError(`Vote detail unavailable. ${normalizeErrorMessage(err)}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [e2eMode, params])

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading vote detail...</p>
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? 'Vote detail unavailable.'}
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link to={e2eMode ? '/?e2e=1' : '/'}>Back to briefing</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit px-0 text-sm text-primary">
        <Link to={e2eMode ? '/?e2e=1' : '/'}>&larr; Back to briefing</Link>
      </Button>

      <Card className="overflow-hidden border-border/70 bg-[linear-gradient(145deg,rgba(255,253,248,0.97),rgba(245,238,226,0.96))]">
        <CardContent className="relative px-6 py-6 sm:px-8">
          <div className="absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{detail.vote.bill ? `${detail.vote.bill.type} ${detail.vote.bill.number}` : `Vote ${detail.vote.vote_number}`}</Badge>
              <Badge variant="outline">{formatVoteDate(detail.vote.vote_date)}</Badge>
              <Badge variant={detail.vote.status === 'passed' ? 'success' : detail.vote.status === 'rejected' ? 'destructive' : 'secondary'}>
                {statusLabel(detail.vote.status)}
              </Badge>
              <Badge variant="outline">{coverageLabel(detail.source_coverage.level)}</Badge>
            </div>

            <h1 className="mt-4 max-w-4xl font-serif text-3xl tracking-tight text-balance text-foreground sm:text-5xl">
              {detail.vote.title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {detail.vote.question}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-800/10 bg-emerald-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-900/80">YEA</p>
                <p className="mt-2 text-3xl font-semibold text-emerald-900">{detail.vote.tally.yea}</p>
              </div>
              <div className="rounded-2xl border border-rose-800/10 bg-rose-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-900/80">NAY</p>
                <p className="mt-2 text-3xl font-semibold text-rose-900">{detail.vote.tally.nay}</p>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                  Cross-party votes
                </p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{detail.crossovers.length}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {detail.source_coverage.note && (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-primary">
          {detail.source_coverage.note}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-white/90">
          <CardContent className="px-6 py-6">
            <h2 className="font-serif text-2xl text-foreground">Why this vote surfaced</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.ranking_reasons.map((reason) => (
                <Badge key={reason.code} variant="muted" className="normal-case tracking-normal">
                  {reason.label}
                </Badge>
              ))}
            </div>
            <div className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Procedural step:{' '}
                <strong className="text-foreground">{prettyStepType(detail.procedural_context.step_type)}</strong>
              </p>
              <p>
                Result: <strong className="text-foreground">{detail.vote.result}</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardContent className="px-6 py-6">
            <h2 className="font-serif text-2xl text-foreground">Party-line breakdown</h2>
            <div className="mt-5 space-y-4">
              {detail.party_breakdown.map((party) => (
                <div key={party.party}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{prettyParty(party.party)}</p>
                      {party.majority_vote && (
                        <p className="text-sm text-muted-foreground">Majority: {party.majority_vote.toUpperCase()}</p>
                      )}
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      {party.yea} yea / {party.nay} nay
                    </div>
                  </div>
                  <Separator className="mt-4" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardContent className="px-6 py-6">
            <h2 className="font-serif text-2xl text-foreground">Cross-party votes</h2>
            {detail.crossovers.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {detail.crossovers.map((crossover) => (
                  <Badge
                    key={crossover.bioguide_id}
                    variant="outline"
                    className="rounded-full px-3 py-2 normal-case tracking-normal text-foreground"
                  >
                    {crossover.name} ({crossover.party}-{crossover.state}) voted {crossover.vote_cast}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                No significant cross-party votes were detected in the current read model.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardContent className="px-6 py-6">
            <h2 className="font-serif text-2xl text-foreground">Historical context</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Thread key: <code>{detail.history.thread_key}</code>
              </p>
              <p>
                Exact measure votes:{" "}
                <strong className="text-foreground">{detail.history.measure_recurrence_count}</strong>
              </p>
              <p>
                Related issue votes:{" "}
                <strong className="text-foreground">{detail.history.issue_recurrence_count}</strong>
              </p>
              <p>
                Issue focus: <strong className="text-foreground">{detail.history.issue_title}</strong>
              </p>
              {detail.history.first_seen_vote_date ? (
                <p>First linked vote in current history: {formatVoteDate(detail.history.first_seen_vote_date)}</p>
              ) : null}
              {detail.history.last_comparable_vote ? (
                <p>
                  Last comparable vote: {detail.history.last_comparable_vote.vote_number} on{' '}
                  {formatVoteDate(detail.history.last_comparable_vote.vote_date)}
                </p>
              ) : (
                <p>No earlier comparable vote is linked yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="bg-white/90">
          <CardContent className="px-6 py-6">
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-2xl text-foreground">Party arguments</h2>
              <p className="text-sm leading-6 text-muted-foreground">{detail.arguments.coverage_note}</p>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {detail.arguments.parties.map((party) => (
                <div
                  key={party.party}
                  className="rounded-2xl border border-border/70 bg-stone-50/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-serif text-xl text-foreground">{prettyParty(party.party)}</h3>
                    <Badge variant={confidenceVariant(party.confidence)}>
                      {party.confidence} confidence
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-700">{party.summary}</p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                    {party.evidence_points.map((point, index) => (
                      <li key={`${party.party}-${index}`}>{point}</li>
                    ))}
                  </ul>
                  {party.coverage_note && (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{party.coverage_note}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardContent className="px-6 py-6">
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-2xl text-foreground">Official-source excerpts</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Excerpts appear only when the current read model has linked source-level evidence.
              </p>
            </div>

            {detail.arguments.excerpts.length > 0 ? (
              <div className="mt-5 space-y-4">
                {detail.arguments.excerpts.map((excerpt) => (
                  <div
                    key={excerpt.id}
                    className="rounded-2xl border border-border/70 bg-stone-50/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span>{excerpt.source_label}</span>
                      {excerpt.date && <span>{formatVoteDate(excerpt.date)}</span>}
                    </div>
                    {excerpt.quote ? (
                      <blockquote className="mt-3 border-l-2 border-primary/20 pl-4 text-sm leading-6 text-stone-700">
                        {excerpt.quote}
                      </blockquote>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-stone-700">{excerpt.note}</p>
                    )}
                    {excerpt.source_url && (
                      <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0">
                        <a href={excerpt.source_url} target="_blank" rel="noreferrer">
                          Open source
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-border/70 bg-stone-50/70 p-4">
                <h3 className="font-serif text-xl text-foreground">No linked excerpts yet</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The backend currently falls back to vote-derived or bill-analysis summaries when
                  excerpt-level evidence is unavailable.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="bg-white/90">
        <CardContent className="px-6 py-6">
          <div className="flex flex-col gap-1">
            <h2 className="font-serif text-2xl text-foreground">Related votes</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Prior or adjacent votes linked to the same issue thread.
            </p>
          </div>

          {detail.history.related_votes.length > 0 ? (
            <div className="mt-5 space-y-4">
              {detail.history.related_votes.map((vote) => (
                <div key={`${vote.congress}-${vote.session}-${vote.vote_number}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-foreground">
                    <div>
                      <strong>{vote.vote_number}</strong> · {vote.title}
                    </div>
                    <div className="text-muted-foreground">{formatVoteDate(vote.vote_date)}</div>
                  </div>
                  <Separator className="mt-4" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-border/70 bg-stone-50/70 p-4">
              <h3 className="font-serif text-xl text-foreground">No related votes linked yet</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This issue thread currently contains only the selected vote.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

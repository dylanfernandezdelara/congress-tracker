import { type ReactNode, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { VoteDetailResponse } from '../api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
import { useVoteDetail } from '../hooks/useVoteDetail'
import { cn } from '../lib/utils'
import {
  confidenceVariant,
  coverageLabel,
  formatVoteDate,
  prettyParty,
  statusLabel,
} from '../utils/voteLabels'

function summarySourceLabel(detail: VoteDetailResponse): string {
  const basis = detail.vote_content_profile.source_basis
  if (basis.includes('official_bill_summary')) return 'Official Congress.gov summary'
  if (basis.includes('analysis_summary')) return 'Generated summary fallback'
  if (basis.includes('bill_metadata_only')) return 'Bill metadata only'
  return 'Vote question only'
}

function prettyStepType(value: string): string {
  return value.split('_').join(' ')
}

function CaseNote({
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

function StatBlock({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={cn('evidence-block', className)}>
      <p className="document-label">{label}</p>
      <div className="mt-3 text-3xl font-semibold leading-none tabular-nums text-foreground">{value}</div>
    </div>
  )
}

export default function VoteDetail() {
  const params = useParams()
  const { detail, error, isLoading } = useVoteDetail(params.congress, params.session, params.voteNumber)

  useEffect(() => {
    if (!detail) {
      document.title = 'Congress Tracker'
      return
    }
    document.title = `${detail.vote.title} | Congress Tracker`
  }, [detail])

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading vote detail...</p>
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col gap-4">
        <div className="note-panel border-destructive/20 bg-destructive/[0.06]">
          <p className="document-label text-destructive/80">Vote detail unavailable</p>
          <p className="mt-2 text-sm leading-6 text-destructive">
            {error ?? 'Vote detail unavailable.'}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link to="/">Back to briefing</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <Button asChild variant="ghost" size="sm" className="w-fit px-0 text-primary">
        <Link to="/">&larr; Back to briefing</Link>
      </Button>

      <Card className="draft-grid">
        <CardContent className="grid gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(300px,0.82fr)] lg:px-8 lg:py-8">
          <div className="max-w-4xl">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {detail.vote.bill
                  ? `${detail.vote.bill.type} ${detail.vote.bill.number}`
                  : `Vote ${detail.vote.vote_number}`}
              </Badge>
              <Badge variant="outline">{formatVoteDate(detail.vote.vote_date)}</Badge>
              <Badge
                variant={
                  detail.vote.status === 'passed'
                    ? 'success'
                    : detail.vote.status === 'rejected'
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {statusLabel(detail.vote.status)}
              </Badge>
              <Badge variant="outline">{coverageLabel(detail.source_coverage.level)}</Badge>
            </div>

            <h1 className="document-title mt-5 text-4xl font-semibold text-foreground sm:text-5xl lg:text-6xl">
              {detail.vote.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground">
              {detail.vote.question}
            </p>

            <div className="note-panel mt-6 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="document-label">Summary</p>
                <Badge variant="outline" className="normal-case tracking-normal">
                  {summarySourceLabel(detail)}
                </Badge>
              </div>
              <p className="mt-3 text-base leading-8 text-foreground">
                {detail.vote_content_profile.public_impact_summary}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatBlock label="Yea" value={detail.vote.tally.yea} className="border-emerald-950/10 bg-emerald-950/[0.04]" />
              <StatBlock label="Nay" value={detail.vote.tally.nay} className="border-rose-950/10 bg-rose-950/[0.04]" />
              <StatBlock label="Cross-party votes" value={detail.crossovers.length} className="border-primary/20 bg-primary/[0.05]" />
            </div>
          </div>

          <aside className="space-y-3 lg:border-l lg:border-primary/15 lg:pl-6">
            <CaseNote label="Result" value={detail.vote.result} />
            <CaseNote label="Procedure" value={prettyStepType(detail.procedural_context.step_type)} />
            <CaseNote label="Issue focus" value={detail.history.issue_title} />
            <CaseNote label="Thread key" value={<code>{detail.history.thread_key}</code>} />
          </aside>
        </CardContent>
      </Card>

      {detail.source_coverage.note && (
        <div className="note-panel border-primary/20 bg-primary/[0.05]">
          <p className="document-label text-primary/80">Coverage note</p>
          <p className="mt-2 text-sm leading-6 text-foreground">{detail.source_coverage.note}</p>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <CardContent className="px-6 py-6">
            <p className="document-kicker">Party record</p>
            <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">
              Party-line breakdown
            </h2>
            <div className="mt-5 space-y-3">
              {detail.party_breakdown.map((party, index) => (
                <div key={party.party} className="note-panel">
                  <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
                    <div>
                      <p className="font-semibold text-foreground">{prettyParty(party.party)}</p>
                      {party.majority_vote && (
                        <p className="text-sm text-muted-foreground">
                          Majority: {party.majority_vote.toUpperCase()}
                        </p>
                      )}
                    </div>
                    <div className="text-sm font-medium text-muted-foreground sm:text-right">
                      {party.yea} yea / {party.nay} nay
                    </div>
                  </div>
                  {index < detail.party_breakdown.length - 1 && <Separator className="mt-4" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="px-6 py-6">
            <p className="document-kicker">Coalition movement</p>
            <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">
              Cross-party votes
            </h2>
            {detail.crossovers.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {detail.crossovers.map((crossover) => (
                  <Badge
                    key={crossover.bioguide_id}
                    variant="outline"
                    className="rounded-[0.9rem] px-3 py-2 normal-case tracking-normal"
                  >
                    {crossover.name} ({crossover.party}-{crossover.state}) voted {crossover.vote_cast}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="note-panel mt-5">
                <p className="text-sm leading-6 text-muted-foreground">
                  No significant cross-party votes were detected in the current read model.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="px-6 py-6">
            <p className="document-kicker">History</p>
            <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">
              Historical context
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 [text-wrap:pretty]">
              <CaseNote label="Exact measure votes" value={detail.history.measure_recurrence_count} />
              <CaseNote label="Related issue votes" value={detail.history.issue_recurrence_count} />
              <CaseNote
                label="First linked vote"
                value={
                  detail.history.first_seen_vote_date
                    ? formatVoteDate(detail.history.first_seen_vote_date)
                    : 'Not linked yet'
                }
              />
              <CaseNote
                label="Last comparable vote"
                value={
                  detail.history.last_comparable_vote
                    ? `${detail.history.last_comparable_vote.vote_number} on ${formatVoteDate(detail.history.last_comparable_vote.vote_date)}`
                    : 'No earlier comparable vote linked yet'
                }
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardContent className="px-6 py-6">
            <p className="document-kicker">Interpretation</p>
            <div className="mt-3 flex flex-col gap-2">
              <h2 className="document-title text-3xl font-semibold text-foreground">
                Party arguments
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {detail.arguments.coverage_note}
              </p>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {detail.arguments.parties.map((party) => (
                <div key={party.party} className="note-panel">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="document-title text-2xl font-semibold text-foreground">
                      {prettyParty(party.party)}
                    </h3>
                    <Badge variant={confidenceVariant(party.confidence)}>
                      {party.confidence} confidence
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground">{party.summary}</p>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                    {party.evidence_points.map((point, index) => (
                      <li key={`${party.party}-${index}`}>{point}</li>
                    ))}
                  </ul>
                  {party.coverage_note && (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {party.coverage_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-6 py-6">
            <p className="document-kicker">Evidence</p>
            <div className="mt-3 flex flex-col gap-2">
              <h2 className="document-title text-3xl font-semibold text-foreground">
                Official-source excerpts
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Excerpts appear only when the current read model has linked source-level evidence.
              </p>
            </div>

            {detail.arguments.excerpts.length > 0 ? (
              <div className="mt-5 space-y-4">
                {detail.arguments.excerpts.map((excerpt) => (
                  <div key={excerpt.id} className="note-panel">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span>{excerpt.source_label}</span>
                      {excerpt.date && <span>{formatVoteDate(excerpt.date)}</span>}
                    </div>
                    {excerpt.quote ? (
                      <blockquote className="mt-3 border-l-2 border-primary/20 pl-4 text-sm leading-7 text-foreground">
                        {excerpt.quote}
                      </blockquote>
                    ) : (
                      <p className="mt-3 text-sm leading-7 text-foreground">{excerpt.note}</p>
                    )}
                    {excerpt.source_url && (
                      <Button asChild variant="link" size="sm" className="mt-3 h-auto">
                        <a href={excerpt.source_url} target="_blank" rel="noreferrer">
                          Open source
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="note-panel mt-5">
                <h3 className="document-title text-2xl font-semibold text-foreground">
                  No linked excerpts yet
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Party summaries use bill analysis or the recorded vote tally when linked excerpts
                  are not available for this vote.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="px-6 py-6">
          <p className="document-kicker">Related record</p>
          <div className="mt-3 flex flex-col gap-2">
            <h2 className="document-title text-3xl font-semibold text-foreground">Related votes</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Prior or adjacent votes linked to the same issue thread.
            </p>
          </div>

          {detail.history.related_votes.length > 0 ? (
            <div className="mt-5 space-y-4">
              {detail.history.related_votes.map((vote) => (
                <div key={`${vote.congress}-${vote.session}-${vote.vote_number}`} className="note-panel">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-foreground">
                    <div>
                      <strong>{vote.vote_number}</strong> · {vote.title}
                    </div>
                    <div className="text-muted-foreground">{formatVoteDate(vote.vote_date)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="note-panel mt-5">
              <h3 className="document-title text-2xl font-semibold text-foreground">
                No related votes linked yet
              </h3>
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

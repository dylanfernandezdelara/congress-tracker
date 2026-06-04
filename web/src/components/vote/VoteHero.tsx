import type { VoteDetailResponse } from '../../api'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import {
  coverageLabel,
  formatVoteDate,
  statusLabel,
} from '../../utils/voteLabels'
import { CaseNote, StatBlock } from './votePrimitives'

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

type VoteHeroProps = {
  detail: VoteDetailResponse
}

export function VoteHero({ detail }: VoteHeroProps) {
  return (
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
            <StatBlock
              label="Cross-party votes"
              value={detail.crossovers.length}
              className="border-primary/20 bg-primary/[0.05]"
            />
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
  )
}

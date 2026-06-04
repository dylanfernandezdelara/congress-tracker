import type { VoteDetailResponse } from '../../api'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { formatVoteDate } from '../../utils/voteLabels'

type OfficialExcerptsProps = {
  excerpts: VoteDetailResponse['arguments']['excerpts']
}

export function OfficialExcerpts({ excerpts }: OfficialExcerptsProps) {
  return (
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

        {excerpts.length > 0 ? (
          <div className="mt-5 space-y-4">
            {excerpts.map((excerpt) => (
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
  )
}

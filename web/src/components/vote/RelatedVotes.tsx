import { Link } from 'react-router-dom'
import type { VoteDetailResponse } from '../../api'
import { Card, CardContent } from '../ui/card'
import { formatVoteDate } from '../../utils/voteLabels'
import { voteDetailPath } from '../../utils/votePaths'

type RelatedVotesProps = {
  relatedVotes: VoteDetailResponse['history']['related_votes']
}

export function RelatedVotes({ relatedVotes }: RelatedVotesProps) {
  return (
    <Card>
      <CardContent className="px-6 py-6">
        <p className="document-kicker">Related record</p>
        <div className="mt-3 flex flex-col gap-2">
          <h2 className="document-title text-3xl font-semibold text-foreground">Related votes</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Prior or adjacent votes linked to the same issue thread.
          </p>
        </div>

        {relatedVotes.length > 0 ? (
          <div className="mt-5 space-y-4">
            {relatedVotes.map((vote) => (
              <div key={`${vote.congress}-${vote.session}-${vote.vote_number}`} className="note-panel">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-foreground">
                  <div>
                    <Link
                      aria-label={`Vote ${vote.vote_number}: ${vote.title}`}
                      className="text-primary underline-offset-4 hover:underline"
                      to={voteDetailPath(vote.congress, vote.session, vote.vote_number)}
                    >
                      <strong>{vote.vote_number}</strong>
                    </Link>{' '}
                    · {vote.title}
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
  )
}

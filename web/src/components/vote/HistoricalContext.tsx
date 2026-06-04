import { Link } from 'react-router-dom'
import type { VoteDetailResponse } from '../../api'
import { Card, CardContent } from '../ui/card'
import { formatVoteDate } from '../../utils/voteLabels'
import { voteDetailPath } from '../../utils/votePaths'
import { CaseNote } from './votePrimitives'

type HistoricalContextProps = {
  history: VoteDetailResponse['history']
}

export function HistoricalContext({ history }: HistoricalContextProps) {
  const lastComparable = history.last_comparable_vote

  return (
    <Card className="h-full">
      <CardContent className="px-6 py-6">
        <p className="document-kicker">History</p>
        <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">
          Historical context
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 [text-wrap:pretty]">
          <CaseNote label="Exact measure votes" value={history.measure_recurrence_count} />
          <CaseNote label="Related issue votes" value={history.issue_recurrence_count} />
          <CaseNote
            label="First linked vote"
            value={
              history.first_seen_vote_date
                ? formatVoteDate(history.first_seen_vote_date)
                : 'Not linked yet'
            }
          />
          <CaseNote
            label="Last comparable vote"
            value={
              lastComparable ? (
                <Link
                  aria-label={`Last comparable vote ${lastComparable.vote_number}: ${lastComparable.title}`}
                  className="text-primary underline-offset-4 hover:underline"
                  to={voteDetailPath(lastComparable.congress, lastComparable.session, lastComparable.vote_number)}
                >
                  {lastComparable.vote_number} on {formatVoteDate(lastComparable.vote_date)}
                </Link>
              ) : (
                'No earlier comparable vote linked yet'
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

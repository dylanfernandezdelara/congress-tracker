import type { VoteDetailResponse } from '../../api'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'

type CrossPartyVotesProps = {
  crossovers: VoteDetailResponse['crossovers']
}

export function CrossPartyVotes({ crossovers }: CrossPartyVotesProps) {
  return (
    <Card className="h-full">
      <CardContent className="px-6 py-6">
        <p className="document-kicker">Coalition movement</p>
        <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">
          Cross-party votes
        </h2>
        {crossovers.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {crossovers.map((crossover) => (
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
  )
}

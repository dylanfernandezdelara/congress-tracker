import type { VoteDetailResponse } from '../../api'
import { Card, CardContent } from '../ui/card'
import { Separator } from '../ui/separator'
import { prettyParty } from '../../utils/voteLabels'

type PartyRecordProps = {
  partyBreakdown: VoteDetailResponse['party_breakdown']
}

export function PartyRecord({ partyBreakdown }: PartyRecordProps) {
  return (
    <Card className="h-full">
      <CardContent className="px-6 py-6">
        <p className="document-kicker">Party record</p>
        <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">
          Party-line breakdown
        </h2>
        <div className="mt-5 space-y-3">
          {partyBreakdown.map((party, index) => (
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
              {index < partyBreakdown.length - 1 && <Separator className="mt-4" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

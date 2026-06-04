import type { VoteDetailResponse } from '../../api'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import { confidenceVariant, prettyParty } from '../../utils/voteLabels'

type PartyArgumentsProps = {
  argumentsSection: VoteDetailResponse['arguments']
}

export function PartyArguments({ argumentsSection }: PartyArgumentsProps) {
  return (
    <Card>
      <CardContent className="px-6 py-6">
        <p className="document-kicker">Interpretation</p>
        <div className="mt-3 flex flex-col gap-2">
          <h2 className="document-title text-3xl font-semibold text-foreground">
            Party arguments
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {argumentsSection.coverage_note}
          </p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {argumentsSection.parties.map((party) => (
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
  )
}

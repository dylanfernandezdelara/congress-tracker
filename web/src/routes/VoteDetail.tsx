import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CrossPartyVotes } from '../components/vote/CrossPartyVotes'
import { HistoricalContext } from '../components/vote/HistoricalContext'
import { OfficialExcerpts } from '../components/vote/OfficialExcerpts'
import { PartyArguments } from '../components/vote/PartyArguments'
import { PartyRecord } from '../components/vote/PartyRecord'
import { RelatedVotes } from '../components/vote/RelatedVotes'
import { VoteHero } from '../components/vote/VoteHero'
import { Button } from '../components/ui/button'
import { useVoteDetail } from '../hooks/useVoteDetail'

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

      <VoteHero detail={detail} />

      {detail.source_coverage.note && (
        <div className="note-panel border-primary/20 bg-primary/[0.05]">
          <p className="document-label text-primary/80">Coverage note</p>
          <p className="mt-2 text-sm leading-6 text-foreground">{detail.source_coverage.note}</p>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <PartyRecord partyBreakdown={detail.party_breakdown} />
        <CrossPartyVotes crossovers={detail.crossovers} />
        <HistoricalContext history={detail.history} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <PartyArguments argumentsSection={detail.arguments} />
        <OfficialExcerpts excerpts={detail.arguments.excerpts} />
      </section>

      <RelatedVotes relatedVotes={detail.history.related_votes} />
    </div>
  )
}

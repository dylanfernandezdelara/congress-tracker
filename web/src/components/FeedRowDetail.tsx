import type { FeedItem, FeedPassageVote } from '../api/types'
import { congressGovBillUrl, formatVoteDate } from '../utils/billLabels'
import { isProceduralFeedItem } from '../utils/feedRowLabels'
import { policyAreaChipClass, policyAreaChipStyle } from '../utils/policyAreaChip'

type FeedRowDetailProps = {
  item: FeedItem
}

function VoteSplitBar({ yeas, nays }: { yeas: number; nays: number }) {
  const total = yeas + nays
  if (total === 0) {
    return <div className="h-1 w-full rounded-full bg-surface-subtle" />
  }

  return (
    <div className="flex h-1 w-full gap-0.5 overflow-hidden rounded-full bg-surface-subtle">
      {yeas > 0 ? <div className="rounded-full bg-pass" style={{ flex: yeas }} /> : null}
      {nays > 0 ? <div className="rounded-full bg-fail opacity-75" style={{ flex: nays }} /> : null}
    </div>
  )
}

function PassageVoteDetails({ votes }: { votes: FeedPassageVote[] }) {
  if (votes.length === 0) {
    return <p className="text-sm text-faint">No passage vote recorded yet.</p>
  }

  return (
    <div className="space-y-3">
      {votes.map((vote) => (
        <div key={`${vote.chamber}-${vote.date}-${vote.question}`} className="space-y-1.5">
          <div className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <p className="font-medium text-foreground">{vote.chamber}</p>
              <p className="shrink-0 font-medium tabular-nums text-secondary">
                {vote.yeas}–{vote.nays}
              </p>
            </div>
            <p className="text-sm text-faint">{formatVoteDate(vote.date)}</p>
          </div>
          <VoteSplitBar yeas={vote.yeas} nays={vote.nays} />
        </div>
      ))}
    </div>
  )
}

export function FeedRowDetail({ item }: FeedRowDetailProps) {
  const sourceUrl = congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number)
  const isProcedural = isProceduralFeedItem(item)

  return (
    <div className="feed-row-detail">
      {isProcedural ? (
        <div className="feed-row-detail-chips flex flex-wrap gap-2">
          <span
            className={policyAreaChipClass('Procedural')}
            style={policyAreaChipStyle('Procedural')}
          >
            Procedural
          </span>
        </div>
      ) : null}

      <section className="feed-row-detail-section">
        <h3 className="feed-row-detail-heading">Vote history</h3>
        <PassageVoteDetails votes={item.passage_votes} />
      </section>

      <footer className="feed-row-detail-footer">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="congress-link text-sm"
        >
          Read on congress.gov ↗
        </a>
      </footer>
    </div>
  )
}

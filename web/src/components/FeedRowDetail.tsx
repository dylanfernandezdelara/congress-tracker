import type { FeedItem, FeedPassageVote } from '../api/types'
import { congressGovBillUrl, formatVoteDate, voteResultClass } from '../utils/billLabels'
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
              <p className={`font-medium ${voteResultClass(vote.result)}`}>{vote.result}</p>
              <p className="shrink-0 text-secondary">
                {vote.yeas}–{vote.nays}
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <p className="font-medium text-foreground">{vote.chamber}</p>
              <p className="shrink-0 text-faint">{formatVoteDate(vote.date)}</p>
            </div>
          </div>
          <VoteSplitBar yeas={vote.yeas} nays={vote.nays} />
        </div>
      ))}
    </div>
  )
}

export function FeedRowDetail({ item }: FeedRowDetailProps) {
  const sourceUrl = congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number)
  const digest = item.digest
  const keyPoints = digest?.key_points ?? []
  const terms = digest?.terms_explained ?? []
  const isProcedural = isProceduralFeedItem(item)
  const policyArea = item.policy_area

  return (
    <div className="feed-row-detail">
      {isProcedural || policyArea ? (
        <div className="feed-row-detail-chips flex flex-wrap gap-2">
          {isProcedural ? (
            <span
              className={policyAreaChipClass('Procedural')}
              style={policyAreaChipStyle('Procedural')}
            >
              Procedural
            </span>
          ) : null}
          {policyArea ? (
            <span
              className={policyAreaChipClass(policyArea)}
              style={policyAreaChipStyle(policyArea)}
            >
              {policyArea}
            </span>
          ) : null}
        </div>
      ) : null}

      <section className="feed-row-detail-section">
        <h3 className="feed-row-detail-heading">Vote history</h3>
        <PassageVoteDetails votes={item.passage_votes} />
      </section>

      {digest?.what_it_does ? (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">What it does</h3>
          <p className="feed-row-detail-body text-sm leading-relaxed text-secondary">
            {digest.what_it_does}
          </p>
        </section>
      ) : null}

      {keyPoints.length > 0 ? (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">Key points</h3>
          <ul className="feed-row-detail-list space-y-1.5">
            {keyPoints.map((point) => (
              <li key={point} className="flex gap-2 text-sm leading-relaxed text-secondary">
                <span className="text-faint" aria-hidden="true">
                  –
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {terms.length > 0 ? (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">Terms explained</h3>
          <dl className="feed-row-detail-terms space-y-2">
            {terms.map((entry) => (
              <div key={entry.term}>
                <dt className="text-sm font-medium text-foreground">{entry.term}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-secondary">{entry.plain}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="feed-row-detail-section">
        <details className="feed-row-crs-details" aria-label="Official CRS summary">
          <summary className="feed-row-detail-heading cursor-pointer select-none">
            Official CRS summary
          </summary>
          <p className="feed-row-detail-body mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">
            {item.raw_summary_text ?? 'No official CRS summary on file.'}
          </p>
        </details>
      </section>

      <footer className="feed-row-detail-footer">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="congress-link text-sm"
        >
          Read on congress.gov ↗
        </a>
      </footer>
    </div>
  )
}

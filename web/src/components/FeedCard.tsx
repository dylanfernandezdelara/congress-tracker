import type { FeedItem } from '../api/types'
import {
  congressGovBillUrl,
  formatBillDocket,
  formatVoteDate,
  voteResultClass,
} from '../utils/billLabels'
import { FlipCard } from './FlipCard'

type FeedCardProps = {
  item: FeedItem
}

export function FeedCard({ item }: FeedCardProps) {
  const docket = formatBillDocket(item.bill.type, item.bill.number, item.bill.congress)
  const headline = item.digest?.headline ?? item.bill.title ?? docket
  const body = item.digest?.what_it_does ?? item.raw_summary_text ?? 'Summary not available yet.'
  const sourceUrl = congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number)

  const front = (
    <div className="garden-card space-y-4">
      <p className="garden-meta tabular-nums">{docket}</p>
      <h2 className="document-title text-2xl text-heading">{headline}</h2>
      <p className="garden-prose text-base text-body">{body}</p>

      {item.digest?.key_points?.length ? (
        <ul className="garden-prose list-disc space-y-1 pl-5 text-sm text-body">
          {item.digest.key_points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}

      {item.digest?.terms_explained?.length ? (
        <div className="flex flex-wrap gap-2">
          {item.digest.terms_explained.map((t) => (
            <span key={t.term} className="garden-tag" title={t.plain}>
              {t.term}
            </span>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-border pt-4">
        {item.passage_votes.map((v) => (
          <p key={`${v.chamber}-${v.date}-${v.question}`} className="garden-prose tabular-nums text-sm">
            <span className="font-semibold text-secondary">{v.chamber}</span>
            <span className="text-muted-foreground"> · </span>
            <span className={voteResultClass(v.result)}>{v.result}</span>
            <span className="text-muted-foreground/80">
              {' '}
              · {v.yeas}–{v.nays} · {formatVoteDate(v.date)}
            </span>
          </p>
        ))}
      </div>

      {item.policy_area ? (
        <p className="garden-meta normal-case tracking-normal opacity-80">{item.policy_area}</p>
      ) : null}
    </div>
  )

  const back = (
    <div className="garden-card garden-card-back space-y-4">
      <p className="garden-meta">Official summary</p>
      <blockquote className="garden-prose m-0 border-0 p-0 text-sm text-body">
        {item.raw_summary_text ?? 'No official CRS summary on file.'}
      </blockquote>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="garden-link text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        View on congress.gov ↗
      </a>
    </div>
  )

  return <FlipCard front={front} back={back} />
}

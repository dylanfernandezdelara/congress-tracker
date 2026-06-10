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
    <div className="dossier-tile space-y-4">
      <p className="docket-line tabular-nums">{docket}</p>
      <h2 className="document-title text-2xl font-semibold text-heading">{headline}</h2>
      <p className="text-base leading-relaxed text-body">{body}</p>

      {item.digest?.key_points?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-body">
          {item.digest.key_points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}

      {item.digest?.terms_explained?.length ? (
        <div className="flex flex-wrap gap-2">
          {item.digest.terms_explained.map((t) => (
            <span key={t.term} className="term-chip" title={t.plain}>
              {t.term}
            </span>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-border/70 pt-4">
        {item.passage_votes.map((v) => (
          <p key={`${v.chamber}-${v.date}-${v.question}`} className="vote-line tabular-nums text-sm">
            <span className="font-medium text-heading">{v.chamber}</span>
            <span className="text-muted-foreground"> · </span>
            <span className={voteResultClass(v.result)}>{v.result}</span>
            <span className="text-muted-foreground">
              {' '}
              · {v.yeas}–{v.nays} · {formatVoteDate(v.date)}
            </span>
          </p>
        ))}
      </div>

      {item.policy_area ? (
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.policy_area}</p>
      ) : null}
    </div>
  )

  const back = (
    <div className="dossier-tile dossier-back space-y-4">
      <p className="official-stamp text-xs font-semibold uppercase tracking-[0.24em] text-heading">
        Official summary
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">
        {item.raw_summary_text ?? 'No official CRS summary on file.'}
      </p>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="ink-link text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        View on congress.gov ↗
      </a>
    </div>
  )

  return <FlipCard front={front} back={back} />
}

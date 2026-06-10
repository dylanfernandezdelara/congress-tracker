import { useId } from 'react'

import type { FeedItem } from '../api/types'
import {
  congressGovBillUrl,
  formatBillDocket,
  formatVoteDate,
  trimDisplayTitle,
  voteResultClass,
} from '../utils/billLabels'
import { FlipCard } from './FlipCard'

type FeedCardProps = {
  item: FeedItem
}

function VoteSplitBar({ yeas, nays }: { yeas: number; nays: number }) {
  const total = yeas + nays
  if (total === 0) {
    return <div className="h-1 w-full rounded-full bg-white/8" />
  }

  return (
    <div className="flex h-1 w-full gap-0.5 overflow-hidden rounded-full bg-white/8">
      {yeas > 0 ? <div className="rounded-full bg-pass" style={{ flex: yeas }} /> : null}
      {nays > 0 ? <div className="rounded-full bg-fail opacity-75" style={{ flex: nays }} /> : null}
    </div>
  )
}

export function FeedCard({ item }: FeedCardProps) {
  const headingId = useId()
  const docket = formatBillDocket(item.bill.type, item.bill.number, item.bill.congress)
  const rawHeadline = item.digest?.headline ?? item.bill.title ?? docket
  const headline = trimDisplayTitle(rawHeadline)
  const body = item.digest?.what_it_does ?? item.raw_summary_text ?? 'Summary not available yet.'
  const sourceUrl = congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number)
  const keyPoints = item.digest?.key_points?.slice(0, 3) ?? []

  const front = (
    <div className="feed-card-surface flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="whitespace-nowrap text-[12px] font-normal uppercase tracking-widest text-faint">
          {docket}
        </p>
        {item.policy_area ? (
          <span
            className="max-w-full truncate rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-secondary"
            title={item.policy_area}
          >
            {item.policy_area}
          </span>
        ) : null}
      </div>

      <h2
        id={headingId}
        className="mt-3 line-clamp-3 text-[19px] font-semibold leading-[1.3] text-foreground"
      >
        {headline}
      </h2>

      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-secondary">{body}</p>

      {item.passage_votes.length > 0 ? (
        <div className="mt-5 space-y-3 border-t border-white/8 pt-4">
          {item.passage_votes.map((v) => (
            <div key={`${v.chamber}-${v.date}-${v.question}`} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <p>
                  <span className="font-medium text-foreground">{v.chamber}</span>{' '}
                  <span className={voteResultClass(v.result)}>{v.result}</span>
                </p>
                <p className="shrink-0 text-secondary">
                  {v.yeas}–{v.nays}
                  <span className="text-faint"> · {formatVoteDate(v.date)}</span>
                </p>
              </div>
              <VoteSplitBar yeas={v.yeas} nays={v.nays} />
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-auto pt-4 text-right text-[12px] text-secondary">Flip for official text ↺</p>
    </div>
  )

  const back = (
    <div className="feed-card-surface flex h-full flex-col">
      <div className="shrink-0">
        <p className="text-[11px] uppercase tracking-widest text-faint">Official CRS summary</p>

        {keyPoints.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {keyPoints.map((point) => (
              <li key={point} className="flex gap-2 text-[13px] leading-relaxed text-secondary">
                <span className="text-faint" aria-hidden="true">
                  –
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={`summary-fade-container ${keyPoints.length > 0 ? 'mt-3' : 'mt-4'}`}>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-secondary">
          {item.raw_summary_text ?? 'No official CRS summary on file.'}
        </p>
      </div>

      <footer className="mt-auto flex shrink-0 items-center justify-between gap-4 border-t border-white/8 pt-4">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="congress-link text-[13px]"
          onClick={(e) => e.stopPropagation()}
        >
          Read on congress.gov ↗
        </a>
        <span className="shrink-0 text-[12px] text-secondary">Flip back ↺</span>
      </footer>
    </div>
  )

  return <FlipCard front={front} back={back} titleId={headingId} />
}

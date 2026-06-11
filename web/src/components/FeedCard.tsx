import { type ReactNode, useCallback, useId, useLayoutEffect, useRef, useState } from 'react'

import type { FeedItem } from '../api/types'
import {
  congressGovBillUrl,
  formatBillDocket,
  formatVoteDate,
  proceduralHeadline,
  summaryBodyText,
  trimDisplayTitle,
  voteResultClass,
} from '../utils/billLabels'
import { FlipCard } from './FlipCard'

type FeedCardProps = {
  item: FeedItem
}

type SummaryScrollContainerProps = {
  className?: string
  children: ReactNode
}

function SummaryScrollContainer({ className = '', children }: SummaryScrollContainerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [atEnd, setAtEnd] = useState(false)

  const updateScrollEnd = useCallback(() => {
    const el = ref.current
    if (!el) return
    const noOverflow = el.scrollHeight <= el.clientHeight + 4
    const scrolledToEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
    setAtEnd(noOverflow || scrolledToEnd)
  }, [])

  useLayoutEffect(() => {
    updateScrollEnd()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateScrollEnd)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateScrollEnd, children])

  return (
    <div
      ref={ref}
      className={`summary-fade-container ${atEnd ? 'is-scrolled-to-end' : ''} ${className}`.trim()}
      role="region"
      aria-label="Official summary text"
      tabIndex={0}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onScroll={updateScrollEnd}
    >
      {children}
    </div>
  )
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

export function FeedCard({ item }: FeedCardProps) {
  const headingId = useId()
  const docket = formatBillDocket(item.bill.type, item.bill.number, item.bill.congress)
  const hasDigestHeadline = Boolean(item.digest?.headline)
  const proceduralTitle =
    !hasDigestHeadline && item.bill.title ? proceduralHeadline(item.bill.title) : null
  const isProcedural = proceduralTitle !== null
  const headline = hasDigestHeadline
    ? trimDisplayTitle(item.digest!.headline!)
    : (proceduralTitle ?? trimDisplayTitle(item.bill.title ?? docket))
  const body =
    item.digest?.what_it_does ??
    (item.raw_summary_text ? summaryBodyText(item.raw_summary_text) : null) ??
    'Summary not available yet.'
  const sourceUrl = congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number)
  const keyPoints = item.digest?.key_points?.slice(0, 3) ?? []
  const policyLabel = isProcedural ? 'Procedural' : item.policy_area

  const front = (
    <div className="feed-card-surface flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="whitespace-nowrap text-[12px] font-normal uppercase tracking-widest text-faint">
          {docket}
        </p>
        {policyLabel ? (
          <span className="rounded-full border border-border-muted px-2 py-0.5 text-[11px] text-secondary">
            {policyLabel}
          </span>
        ) : null}
      </div>

      <h2
        id={headingId}
        className="mt-3 line-clamp-3 max-sm:line-clamp-none text-[19px] font-semibold leading-[1.3] text-foreground"
      >
        {headline}
      </h2>

      <p className="mb-5 mt-3 line-clamp-3 max-sm:line-clamp-none text-sm leading-relaxed text-secondary">
        {body}
      </p>

      <div className="mt-auto max-sm:mt-0">
        {item.passage_votes.length > 0 ? (
          <div className="space-y-3 border-t border-border pt-4">
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

        <p className="pt-4 text-right text-[12px] text-secondary">Flip for official text ↺</p>
      </div>
    </div>
  )

  const back = (
    <div className="feed-card-surface flex h-full flex-col">
      <div className="shrink-0">
        <p className="text-[11px] uppercase tracking-widest text-faint">Official CRS summary</p>

        {isProcedural && item.bill.title ? (
          <p className="mt-2 text-[12px] leading-relaxed text-faint">{item.bill.title}</p>
        ) : null}

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

      <SummaryScrollContainer
        className={keyPoints.length > 0 || isProcedural ? 'mt-3' : 'mt-4'}
      >
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-secondary">
          {item.raw_summary_text ?? 'No official CRS summary on file.'}
        </p>
      </SummaryScrollContainer>

      <footer className="mt-auto flex shrink-0 items-center justify-between gap-4 border-t border-border pt-4">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="congress-link shrink-0 whitespace-nowrap text-[13px]"
          onClick={(e) => e.stopPropagation()}
        >
          Read on congress.gov ↗
        </a>
        <span className="hidden shrink-0 text-[12px] text-secondary min-[360px]:inline">
          Flip back ↺
        </span>
      </footer>
    </div>
  )

  return <FlipCard front={front} back={back} titleId={headingId} />
}

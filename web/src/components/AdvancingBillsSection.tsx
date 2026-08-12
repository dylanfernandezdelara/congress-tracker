import { useId, useState } from 'react'

import type { AdvancingBillItem } from '../api/types'
import { congressGovBillUrl, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { formatBillQueryParam } from '../utils/billDeepLink'
import { BillIdChip } from './BillIdChip'
import { BillProcessTimeline } from './BillProcessTimeline'
import { ExpandChevron } from './ExpandChevron'
import { FeedRowDetail } from './FeedRowDetail'

type AdvancingBillsSectionProps = {
  items: AdvancingBillItem[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

function itemKey(item: AdvancingBillItem): string {
  return formatBillQueryParam({
    congress: item.congress,
    type: item.bill_type,
    number: item.bill_number,
  })
}

function AdvancingBillRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: AdvancingBillItem
  isExpanded: boolean
  onToggle: (key: string) => void
}) {
  const detailId = useId()
  const headlineId = useId()
  const key = itemKey(item)
  const billId = formatShortBillId(item.bill_type, item.bill_number)
  const headline = item.headline?.trim() || item.title?.trim() || billId
  const advanceDate = item.last_advance_at.slice(0, 10)
  const statusLine =
    item.current_label?.trim() ||
    item.process?.current_label?.trim() ||
    'Recent committee progress'
  const sourceUrl = congressGovBillUrl(item.congress, item.bill_type, item.bill_number)

  return (
    <li className={`advancing-bills-row${isExpanded ? ' is-expanded' : ''}`}>
      <article aria-labelledby={headlineId}>
        <button
          type="button"
          className="advancing-bills-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} committee process for ${billId}`}
          onClick={() => onToggle(key)}
        >
          <div className="advancing-bills-row-top">
            <h3 id={headlineId} className="advancing-bills-headline">
              {headline}
            </h3>
            <ExpandChevron />
          </div>
          <p className="advancing-bills-status">{statusLine}</p>
          <div className="advancing-bills-meta">
            <BillIdChip type={item.bill_type} number={item.bill_number} />
            <time dateTime={advanceDate}>{formatVoteDate(advanceDate)}</time>
          </div>
        </button>
        <div
          id={detailId}
          className="advancing-bills-detail"
          role="region"
          aria-label={`Committee process for ${billId}`}
          hidden={!isExpanded}
        >
          {isExpanded ? (
            item.item ? (
              <FeedRowDetail item={item.item} />
            ) : (
              <div className="advancing-bills-detail-fallback">
                {item.process ? <BillProcessTimeline process={item.process} /> : null}
                <p className="text-[13px] text-secondary">{statusLine}</p>
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="congress-link"
                >
                  Read on congress.gov ↗
                </a>
              </div>
            )
          ) : null}
        </div>
      </article>
    </li>
  )
}

export function AdvancingBillsSection({
  items,
  loading,
  error,
  onRetry,
}: AdvancingBillsSectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (loading && (!items || items.length === 0)) {
    return (
      <section className="advancing-bills" aria-label="Moving through committee" aria-busy="true">
        <div className="advancing-bills-header">
          <h2 className="home-feed-title">Moving through committee</h2>
          <p className="advancing-bills-lede">Loading recent committee progress…</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="advancing-bills" aria-label="Moving through committee">
        <div className="advancing-bills-header">
          <h2 className="home-feed-title">Moving through committee</h2>
          <p className="text-[13px] text-fail">{error}</p>
          {onRetry ? (
            <button type="button" className="ghost-button text-xs" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      </section>
    )
  }

  // Keep the homepage quiet when there is nothing to show.
  if (!items || items.length === 0) return null

  // Cap the strip so the chronological feed still fits the first viewport.
  const visible = items.slice(0, 3)

  return (
    <section className="advancing-bills" aria-label="Moving through committee">
      <div className="advancing-bills-header">
        <h2 className="home-feed-title">Moving through committee</h2>
        <p className="advancing-bills-lede">
          Recent committee progress — before these bills reach a floor vote.
        </p>
      </div>
      <ul className="advancing-bills-list">
        {visible.map((item) => {
          const key = itemKey(item)
          return (
            <AdvancingBillRow
              key={key}
              item={item}
              isExpanded={expanded === key}
              onToggle={(next) => setExpanded((cur) => (cur === next ? null : next))}
            />
          )
        })}
      </ul>
    </section>
  )
}

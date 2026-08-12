import { useId, useState } from 'react'

import type { AdvancingBillItem } from '../api/types'
import { formatBillQueryParam } from '../utils/billDeepLink'
import { formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { BillIdChip } from './BillIdChip'
import { BillProcessTimeline } from './BillProcessTimeline'
import { ExpandChevron } from './ExpandChevron'
import { FeedRowDate } from './FeedRowDate'
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

  return (
    <li className={`feed-row${isExpanded ? ' is-expanded' : ''}`}>
      <article className="feed-row-article" aria-labelledby={headlineId}>
        <button
          type="button"
          className="feed-row-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${billId}`}
          onClick={() => onToggle(key)}
        >
          <FeedRowDate dateTime={advanceDate} primary={formatVoteDate(advanceDate)} />
          <div className="feed-row-main">
            <div className="feed-row-header">
              <h3 id={headlineId} className="feed-row-topic">
                {headline}
              </h3>
              <ExpandChevron />
            </div>
            <div className="feed-row-meta-row">
              <span className="feed-row-badge">Advancing</span>
              <BillIdChip type={item.bill_type} number={item.bill_number} />
              {item.current_label ? (
                <span className="feed-row-chip feed-row-chip--process">{item.current_label}</span>
              ) : null}
            </div>
          </div>
        </button>
        {isExpanded ? (
          <div id={detailId} className="feed-row-detail-wrap">
            {item.item ? (
              <FeedRowDetail item={item.item} />
            ) : (
              <div className="feed-row-detail">
                <p className="text-sm text-secondary">
                  {item.current_label ??
                    item.process?.current_label ??
                    'Committee process details are still catching up.'}
                </p>
                {item.process && item.process.stages.length > 0 ? (
                  <BillProcessTimeline process={item.process} />
                ) : null}
              </div>
            )}
          </div>
        ) : null}
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

  if (loading) {
    return (
      <section className="home-secondary-section" aria-label="Advancing in committee">
        <h2 className="sidebar-section-title">Advancing in committee</h2>
        <p className="text-xs text-faint">Loading…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="home-secondary-section" aria-label="Advancing in committee">
        <h2 className="sidebar-section-title">Advancing in committee</h2>
        <p className="text-xs text-fail">{error}</p>
        {onRetry ? (
          <button type="button" className="ghost-button text-xs" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </section>
    )
  }

  if (!items || items.length === 0) {
    return (
      <section className="home-secondary-section" aria-label="Advancing in committee">
        <h2 className="sidebar-section-title">Advancing in committee</h2>
        <p className="text-xs text-faint">No recent committee advances yet.</p>
      </section>
    )
  }

  return (
    <section className="home-secondary-section" aria-label="Advancing in committee">
      <h2 className="sidebar-section-title">Advancing in committee</h2>
      <ul className="feed-list">
        {items.map((item) => {
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

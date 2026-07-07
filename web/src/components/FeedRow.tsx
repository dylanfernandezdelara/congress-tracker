import { useId } from 'react'

import type { FeedItem } from '../api/types'
import { formatVoteDate } from '../utils/billLabels'
import {
  getFeedEventDisplay,
  getFeedRowMeta,
  getFeedRowDisplayDate,
  getFeedSummaryDisplay,
  getFeedTopic,
  isProceduralFeedItem,
} from '../utils/feedRowLabels'
import { policyAreaChipClass, policyAreaChipStyle } from '../utils/policyAreaChip'
import { BillIdChip } from './BillIdChip'
import { FeedRowDetail } from './FeedRowDetail'
import { FeedRowExecutiveQuote } from './FeedRowExecutiveQuote'

type FeedRowProps = {
  item: FeedItem
  isExpanded: boolean
  onToggle: () => void
}

export function FeedRow({ item, isExpanded, onToggle }: FeedRowProps) {
  const badgeId = useId()
  const topicId = useId()
  const policyAreaId = useId()
  const marginId = useId()
  const eventId = useId()
  const summaryId = useId()
  const detailId = useId()
  const topic = getFeedTopic(item)
  const summary = getFeedSummaryDisplay(item)
  const meta = getFeedRowMeta(item)
  const displayDate = getFeedRowDisplayDate(item)
  const eventDisplay = getFeedEventDisplay(item)
  const policyArea = item.policy_area
  const showEventLine = meta.kind !== 'passed' && meta.kind !== 'failed'
  const executiveSignal = item.executive_signals?.[0]

  return (
    <li className={`feed-row feed-row--${meta.kind}${isExpanded ? ' is-expanded' : ''}`}>
      <article className="feed-row-article" aria-labelledby={topicId}>
        <button
          type="button"
          className="feed-row-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-labelledby={`${badgeId} ${topicId}${policyArea && !isProceduralFeedItem(item) ? ` ${policyAreaId}` : ''}${meta.margin && (meta.kind === 'passed' || meta.kind === 'failed') ? ` ${marginId}` : ''}${showEventLine ? ` ${eventId}` : ''}`}
          aria-describedby={summaryId}
          onClick={onToggle}
        >
          <div className="feed-row-main">
            <div className="feed-row-header">
              <div className="feed-row-meta-row">
                <span
                  id={badgeId}
                  className={`feed-row-badge feed-row-badge--${meta.kind}${meta.kind === 'passed' ? ' text-pass' : meta.kind === 'failed' ? ' text-fail' : ''}`}
                >
                  {meta.outcomeLabel}
                </span>
                {meta.chamber ? <span className="feed-row-chip">{meta.chamber}</span> : null}
                {meta.margin && (meta.kind === 'passed' || meta.kind === 'failed') ? (
                  <span id={marginId} className="feed-row-chip feed-row-chip--margin">
                    {meta.margin}
                  </span>
                ) : null}
                <BillIdChip type={item.bill.type} number={item.bill.number} />
                {executiveSignal ? (
                  <span className="feed-row-chip feed-row-chip--executive">Executive · Truth Social</span>
                ) : null}
                {policyArea && !isProceduralFeedItem(item) ? (
                  <span
                    id={policyAreaId}
                    data-feed-policy-area
                    className={`feed-row-policy-area ${policyAreaChipClass(policyArea)}`}
                    style={policyAreaChipStyle(policyArea)}
                  >
                    {policyArea}
                  </span>
                ) : null}
                <span className="feed-row-date-wrap">
                  <time className="feed-row-date" dateTime={displayDate.iso}>
                    {formatVoteDate(displayDate.iso)}
                    {displayDate.kind === 'signal' ? ' · Trump post' : ''}
                  </time>
                  <span className="feed-row-chevron" aria-hidden="true">
                    ›
                  </span>
                </span>
              </div>
            </div>

            <h2 id={topicId} data-feed-topic className="feed-row-topic">
              {topic}
            </h2>

            <p
              id={eventId}
              className={`feed-row-event${meta.kind === 'none' ? ' feed-row-event--muted' : ''}`}
              hidden={!showEventLine}
            >
              {eventDisplay}
            </p>

            <div
              id={summaryId}
              data-feed-summary
              className={`feed-row-summary${summary.pending ? ' feed-row-summary--pending' : ''}`}
            >
              <p className="feed-row-teaser">{summary.lead}</p>
              {summary.bullets.length > 0 ? (
                <ul className="feed-row-summary-bullets" aria-label="Key points">
                  {summary.bullets.map((point, index) => (
                    <li key={`${index}-${point}`}>{point}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </button>

        {executiveSignal && !isExpanded ? (
          <div className="feed-row-executive-quote-wrap">
            <FeedRowExecutiveQuote
              signal={executiveSignal}
              bill={item.bill}
              billHeadline={item.digest?.headline ?? null}
              relatedBills={item.related_executive_bills}
            />
          </div>
        ) : null}

        <div
          id={detailId}
          className="feed-row-detail-panel"
          role="region"
          aria-label={`Details for ${topic}`}
          hidden={!isExpanded}
        >
          {isExpanded ? <FeedRowDetail item={item} /> : null}
        </div>
      </article>
    </li>
  )
}

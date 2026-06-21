import { useId } from 'react'

import type { FeedItem } from '../api/types'
import { MOBILE_MEDIA_QUERY } from '../constants/feed'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { formatVoteDate } from '../utils/billLabels'
import {
  getFeedEventDisplay,
  getFeedRowMeta,
  getFeedSummaryDisplay,
  getFeedTopic,
  isProceduralFeedItem,
} from '../utils/feedRowLabels'
import { policyAreaChipClass, policyAreaChipStyle } from '../utils/policyAreaChip'
import { FeedRowDetail } from './FeedRowDetail'

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
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const topic = getFeedTopic(item)
  const summary = getFeedSummaryDisplay(item, { full: isMobile })
  const meta = getFeedRowMeta(item)
  const eventDisplay = getFeedEventDisplay(item)
  const policyArea = item.policy_area
  const showEventLine = meta.kind !== 'passed' && meta.kind !== 'failed'

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
            <div className="feed-row-meta-row">
              <span id={badgeId} className={`feed-row-badge feed-row-badge--${meta.kind}`}>
                {meta.outcomeLabel}
              </span>
              {meta.chamber ? <span className="feed-row-chip">{meta.chamber}</span> : null}
              {meta.margin && (meta.kind === 'passed' || meta.kind === 'failed') ? (
                <span id={marginId} className="feed-row-chip feed-row-chip--margin">
                  {meta.margin}
                </span>
              ) : null}
              <span className="feed-row-chip feed-row-chip--bill">{meta.billId}</span>
              <time
                className="feed-row-date"
                dateTime={item.latest_passage_date}
              >
                {formatVoteDate(item.latest_passage_date)}
              </time>
            </div>

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

            <h2
              id={topicId}
              data-feed-topic
              className="feed-row-topic"
            >
              {topic}
            </h2>

            <p
              id={eventId}
              className={`feed-row-event${meta.kind === 'none' ? ' feed-row-event--muted' : ''}`}
              hidden={!showEventLine}
            >
              {eventDisplay}
            </p>

            <p
              id={summaryId}
              data-feed-summary
              className={`feed-row-teaser${summary.pending ? ' feed-row-teaser--pending' : ''}`}
            >
              {summary.text}
            </p>
          </div>

          <span className="feed-row-chevron" aria-hidden="true">
            ›
          </span>
        </button>

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

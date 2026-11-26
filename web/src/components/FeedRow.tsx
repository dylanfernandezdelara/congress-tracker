import { memo, useId } from 'react'

import type { FeedItem } from '../api/types'
import { CURRENT_PRESIDENT } from '../constants/president'
import { feedRowKey } from '../utils/billDeepLink'
import { formatVoteDate } from '../utils/billLabels'
import {
  getCollapsedSummaryLead,
  getFeedRowDisplayDate,
  getFeedSummaryContent,
  getFeedTopic,
} from '../utils/feedRowLabels'
import { getFeedRowStatus } from '../utils/feedRowStatus'
import { ExpandChevron } from './ExpandChevron'
import { FeedRowDate } from './FeedRowDate'
import { Collapsible, CollapsibleContent } from './dfdl/collapsible'
import { FeedRowDetail } from './FeedRowDetail'
import { FeedRowExecutiveQuote } from './FeedRowExecutiveQuote'

const PRESIDENT_NAME_PARTS = CURRENT_PRESIDENT.name.trim().split(/\s+/)
const PRESIDENT_LAST_NAME =
  PRESIDENT_NAME_PARTS[PRESIDENT_NAME_PARTS.length - 1] ?? CURRENT_PRESIDENT.name

type FeedRowProps = {
  item: FeedItem
  isExpanded: boolean
  onToggle: (item: FeedItem) => void
}

export const FeedRow = memo(function FeedRow({
  item,
  isExpanded,
  onToggle,
}: FeedRowProps) {
  const statusId = useId()
  const topicId = useId()
  const summaryId = useId()
  const detailId = useId()
  const topic = getFeedTopic(item)
  const summary = getFeedSummaryContent(item)
  const summaryLead = getCollapsedSummaryLead(summary)
  const status = getFeedRowStatus(item)
  const displayDate = getFeedRowDisplayDate(item)
  const executiveSignal = item.executive_signals?.[0]

  const rowKey = feedRowKey(item)

  return (
    <li
      className={`feed-row feed-row--${status.kind}${isExpanded ? ' is-expanded' : ''}`}
      data-feed-row-key={rowKey}
    >
      <article className="feed-row-article" aria-labelledby={topicId}>
        <button
          type="button"
          className="feed-row-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-labelledby={`${topicId} ${statusId}`}
          aria-describedby={isExpanded ? undefined : summaryId}
          onClick={() => onToggle(item)}
        >
          <FeedRowDate
            dateTime={displayDate.iso}
            primary={formatVoteDate(displayDate.iso)}
            secondary={
              displayDate.kind === 'signal'
                ? `${PRESIDENT_LAST_NAME} post`
                : displayDate.kind === 'intro' && status.kind !== 'introduced'
                  ? 'Introduced'
                  : undefined
            }
          />

          <div className="feed-row-main">
            <div className="feed-row-header">
              <h3 id={topicId} data-feed-topic className="feed-row-topic">
                {topic}
              </h3>
              <ExpandChevron />
            </div>

            <p id={statusId} className="feed-row-status" data-feed-status>
              <span className={`feed-row-badge feed-row-badge--${status.kind}${status.toneClass}`}>
                {status.lead}
              </span>
              {status.rest}
              {status.partySplit ? (
                <span className="feed-row-status-split"> · {status.partySplit}</span>
              ) : null}
              {status.note ? <span className="feed-row-status-note"> · {status.note}</span> : null}
            </p>

            {!isExpanded ? (
              <div
                id={summaryId}
                data-feed-summary
                className={`feed-row-summary${summary.pending ? ' feed-row-summary--pending' : ''}`}
              >
                <p className="feed-row-teaser">{summaryLead}</p>
              </div>
            ) : null}
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

        {/* Details mount only while open or closing, and the height animates so the rows below slide. */}
        <Collapsible open={isExpanded}>
          <CollapsibleContent expand id={detailId} role="region" aria-label={`Details for ${topic}`}>
            <div className="feed-row-detail-panel">
              <FeedRowDetail item={item} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </article>
    </li>
  )
})

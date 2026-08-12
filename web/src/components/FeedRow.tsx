import { memo, useId } from 'react'

import type { FeedItem } from '../api/types'
import { CURRENT_PRESIDENT } from '../constants/president'
import { feedRowKey } from '../utils/billDeepLink'
import { formatVoteDate } from '../utils/billLabels'
import {
  getCollapsedSummaryLead,
  getFeedRowDisplayDate,
  getFeedRowView,
  getFeedSummaryContent,
  getFeedTopic,
} from '../utils/feedRowLabels'
import { BillIdChip } from './BillIdChip'
import { ExpandChevron } from './ExpandChevron'
import { FeedRowDate } from './FeedRowDate'
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

export const FeedRow = memo(function FeedRow({ item, isExpanded, onToggle }: FeedRowProps) {
  const badgeId = useId()
  const topicId = useId()
  const policyAreaId = useId()
  const marginId = useId()
  const deskChipId = useId()
  const eventId = useId()
  const summaryId = useId()
  const detailId = useId()
  const topic = getFeedTopic(item)
  const summary = getFeedSummaryContent(item)
  const summaryLead = getCollapsedSummaryLead(summary)
  const { meta, eventDisplay, badgeToneClass, showMarginChip, showEventLine, eventToneClass } =
    getFeedRowView(item)
  const displayDate = getFeedRowDisplayDate(item)
  const policyArea = item.policy_area
  const isProcedural = meta.kind === 'procedural'
  const executiveSignal = item.executive_signals?.[0]

  const rowKey = feedRowKey(item)

  return (
    <li
      className={`feed-row feed-row--${meta.kind}${isExpanded ? ' is-expanded' : ''}`}
      data-feed-row-key={rowKey}
    >
      <article className="feed-row-article" aria-labelledby={topicId}>
        <button
          type="button"
          className="feed-row-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-labelledby={`${badgeId} ${topicId}${policyArea && !isProcedural ? ` ${policyAreaId}` : ''}${showMarginChip ? ` ${marginId}` : ''}${meta.presidentDeskChip ? ` ${deskChipId}` : ''}${showEventLine ? ` ${eventId}` : ''}`}
          aria-describedby={isExpanded ? undefined : summaryId}
          onClick={() => onToggle(item)}
        >
          <FeedRowDate
            dateTime={displayDate.iso}
            primary={formatVoteDate(displayDate.iso)}
            secondary={displayDate.kind === 'signal' ? `${PRESIDENT_LAST_NAME} post` : undefined}
          />

          <div className="feed-row-main">
            <div className="feed-row-header">
              <h3 id={topicId} data-feed-topic className="feed-row-topic">
                {topic}
              </h3>
              <ExpandChevron />
            </div>

            <div className="feed-row-meta-row">
              <span
                id={badgeId}
                className={`feed-row-badge feed-row-badge--${meta.kind}${badgeToneClass}`}
              >
                {meta.outcomeLabel}
              </span>
              {showMarginChip ? (
                <span id={marginId} className="feed-row-chip feed-row-chip--margin">
                  {meta.margin}
                </span>
              ) : null}
              {meta.chamber ? <span className="feed-row-chip">{meta.chamber}</span> : null}
              <BillIdChip type={item.bill.type} number={item.bill.number} />
              {meta.presidentDeskChip ? (
                <span id={deskChipId} className="feed-row-chip feed-row-chip--president-desk">
                  {meta.presidentDeskChip}
                </span>
              ) : null}
              {meta.processChip ? (
                <span className="feed-row-chip feed-row-chip--process">{meta.processChip}</span>
              ) : null}
              {executiveSignal ? (
                <span className="feed-row-chip feed-row-chip--executive">Executive</span>
              ) : null}
            </div>

            {policyArea && !isProcedural ? (
              <p
                id={policyAreaId}
                data-feed-policy-area
                className="feed-row-policy-area"
              >
                {policyArea}
              </p>
            ) : null}

            <p
              id={eventId}
              className={`feed-row-event${eventToneClass}`}
              hidden={!showEventLine}
            >
              {eventDisplay}
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
})

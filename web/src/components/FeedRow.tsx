import { useId } from 'react'

import type { FeedItem } from '../api/types'
import { formatVoteDate } from '../utils/billLabels'
import {
  getFeedEventLine,
  getFeedStatusKind,
  getFeedTeaser,
  getFeedTopic,
  type FeedStatusKind,
} from '../utils/feedRowLabels'
import { FeedRowDetail } from './FeedRowDetail'

type FeedRowProps = {
  item: FeedItem
  isExpanded: boolean
  onToggle: () => void
}

const OUTCOME_CLASS: Record<FeedStatusKind, string> = {
  passed: 'text-pass',
  failed: 'text-fail',
  procedural: 'text-secondary',
  none: 'text-faint',
}

function FeedRowEventLine({ item, eventId }: { item: FeedItem; eventId: string }) {
  const line = getFeedEventLine(item)

  return (
    <p
      id={eventId}
      className={`feed-row-event text-sm${line.kind === 'none' ? ' text-faint' : ''}`}
    >
      <span className={`font-medium ${OUTCOME_CLASS[line.kind]}`}>{line.outcome}</span>
      {line.detail ? (
        <>
          {' · '}
          {line.detail}
        </>
      ) : null}
    </p>
  )
}

export function FeedRow({ item, isExpanded, onToggle }: FeedRowProps) {
  const topicId = useId()
  const eventId = useId()
  const detailId = useId()
  const topic = getFeedTopic(item)
  const teaser = getFeedTeaser(item)
  const statusKind = getFeedStatusKind(item)

  return (
    <li className={`feed-row${isExpanded ? ' is-expanded' : ''}`}>
      <article className="feed-row-article" aria-labelledby={topicId}>
        <button
          type="button"
          className="feed-row-toggle feed-row-inner"
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? detailId : undefined}
          aria-labelledby={`${topicId} ${eventId}`}
          onClick={onToggle}
        >
          <span
            className={`feed-row-status-dot feed-row-status-dot--${statusKind}`}
            aria-hidden="true"
          />
          <div className="feed-row-content">
            <div className="feed-row-header">
              <h2
                id={topicId}
                data-feed-topic
                className="feed-row-topic text-base font-semibold line-clamp-2"
              >
                {topic}
              </h2>
              <div className="feed-row-meta">
                <time
                  className="feed-row-date text-sm text-faint"
                  dateTime={item.latest_passage_date}
                >
                  {formatVoteDate(item.latest_passage_date)}
                </time>
                <span className="feed-row-chevron text-faint" aria-hidden="true">
                  ›
                </span>
              </div>
            </div>
            <FeedRowEventLine item={item} eventId={eventId} />
            {teaser ? (
              <p className="feed-row-teaser text-sm text-secondary line-clamp-1">{teaser}</p>
            ) : null}
          </div>
        </button>

        {isExpanded ? (
          <div
            id={detailId}
            className="feed-row-detail-panel"
            role="region"
            aria-label={`Details for ${topic}`}
          >
            <FeedRowDetail item={item} />
          </div>
        ) : null}
      </article>
    </li>
  )
}

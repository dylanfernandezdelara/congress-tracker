import { type KeyboardEvent, useId } from 'react'

import type { FeedItem } from '../api/types'
import { formatVoteDate, voteResultClass } from '../utils/billLabels'
import {
  getFeedEventLine,
  getFeedStatusKind,
  getFeedTeaser,
  getFeedTopic,
  getPrimaryPassageVote,
} from '../utils/feedRowLabels'
import { FeedRowDetail } from './FeedRowDetail'

type FeedRowProps = {
  item: FeedItem
  isExpanded: boolean
  onToggle: () => void
}

function FeedRowEventLine({ item }: { item: FeedItem }) {
  const line = getFeedEventLine(item)
  const vote = getPrimaryPassageVote(item)

  if (line === 'No vote recorded') {
    return <p className="feed-row-event text-sm text-faint">{line}</p>
  }

  const separator = ' · '
  const separatorIndex = line.indexOf(separator)
  const outcome = separatorIndex === -1 ? line : line.slice(0, separatorIndex)
  const remainder = separatorIndex === -1 ? '' : line.slice(separatorIndex + separator.length)

  let outcomeClass = 'text-faint'
  if (outcome === 'Passed' || outcome === 'Failed') {
    outcomeClass = vote ? voteResultClass(vote.result) : 'text-faint'
  }

  return (
    <p className="feed-row-event text-sm">
      <span className={`font-medium ${outcomeClass}`}>{outcome}</span>
      {remainder ? (
        <>
          {separator}
          {remainder}
        </>
      ) : null}
    </p>
  )
}

export function FeedRow({ item, isExpanded, onToggle }: FeedRowProps) {
  const topicId = useId()
  const detailId = useId()
  const topic = getFeedTopic(item)
  const teaser = getFeedTeaser(item)
  const statusKind = getFeedStatusKind(item)
  const expandLabel = isExpanded ? `Hide details for ${topic}` : `Show details for ${topic}`

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle()
    }
  }

  return (
    <li className={`feed-row${isExpanded ? ' is-expanded' : ''}`}>
      <article className="feed-row-article" aria-labelledby={topicId}>
        <button
          type="button"
          className="feed-row-toggle feed-row-inner"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-label={expandLabel}
          onClick={onToggle}
          onKeyDown={onKeyDown}
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
            <FeedRowEventLine item={item} />
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

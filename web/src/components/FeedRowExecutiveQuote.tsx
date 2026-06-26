import type { ExecutiveSignal } from '../api/types'
import { CURRENT_PRESIDENT } from '../constants/president'
import { formatVoteDate } from '../utils/billLabels'

type FeedRowExecutiveQuoteProps = {
  signal: ExecutiveSignal
  /** Collapsed row clamps long posts; expanded detail shows the full quote. */
  clamp?: boolean
}

export function FeedRowExecutiveQuote({ signal, clamp = false }: FeedRowExecutiveQuoteProps) {
  const postedDate = formatVoteDate(signal.posted_at.slice(0, 10))

  return (
    <blockquote
      className={`feed-row-executive-quote${clamp ? ' feed-row-executive-quote--clamp' : ''}`}
      cite={signal.source_url}
    >
      <p className="feed-row-executive-quote__text">&ldquo;{signal.quote}&rdquo;</p>
      <footer className="feed-row-executive-quote__footer">
        <cite className="feed-row-executive-quote__attribution">
          {CURRENT_PRESIDENT.name} · Truth Social · {postedDate}
        </cite>
        <span className="feed-row-executive-quote__links">
          <a href={signal.source_url} target="_blank" rel="noopener noreferrer">
            View post
          </a>
          {signal.archive_url ? (
            <>
              <span aria-hidden="true"> · </span>
              <a href={signal.archive_url} target="_blank" rel="noopener noreferrer">
                Archive
              </a>
            </>
          ) : null}
        </span>
      </footer>
    </blockquote>
  )
}

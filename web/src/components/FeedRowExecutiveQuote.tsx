import type { ExecutiveSignal, FeedBill, RelatedExecutiveBill } from '../api/types'
import { CURRENT_PRESIDENT } from '../constants/president'
import { formatBillDocket, formatVoteDate } from '../utils/billLabels'
import {
  formatExecutiveRoleLabel,
  formatRelatedExecutiveBillLine,
} from '../utils/executiveLabels'

type FeedRowExecutiveQuoteProps = {
  signal: ExecutiveSignal
  bill: FeedBill
  relatedBills?: RelatedExecutiveBill[]
}

/** Prefer verbatim post text; fall back to stored summary only when quote is missing. */
export function getExecutiveQuoteText(signal: ExecutiveSignal): string | null {
  const quote = signal.quote?.trim()
  if (quote) return quote
  const summary = signal.summary?.trim()
  return summary || null
}

export function FeedRowExecutiveQuote({ signal, bill, relatedBills = [] }: FeedRowExecutiveQuoteProps) {
  const quoteText = getExecutiveQuoteText(signal)
  if (!quoteText) return null

  const postedDate = formatVoteDate(signal.posted_at.slice(0, 10))
  const billLabel = formatBillDocket(bill.type, bill.number, bill.congress)
  const roleLabel = signal.role ? formatExecutiveRoleLabel(signal.role) : 'About this bill'

  return (
    <blockquote className="feed-row-executive-quote" cite={signal.source_url}>
      <header className="feed-row-executive-quote__header">
        <p className="feed-row-executive-quote__context">
          <span className="feed-row-executive-quote__context-label">{roleLabel}</span>
          <span className="feed-row-executive-quote__context-bill"> · {billLabel}</span>
        </p>
        {signal.rationale ? (
          <p className="feed-row-executive-quote__rationale">{signal.rationale}</p>
        ) : null}
        {relatedBills.length > 0 ? (
          <p className="feed-row-executive-quote__related-note">
            Same post also mentions{' '}
            {relatedBills.map((related, index) => (
              <span key={`${related.congress}-${related.type}-${related.number}`}>
                {index > 0 ? '; ' : ''}
                {formatRelatedExecutiveBillLine(related)}
              </span>
            ))}
            .
          </p>
        ) : null}
      </header>
      <p className="feed-row-executive-quote__text">&ldquo;{quoteText}&rdquo;</p>
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

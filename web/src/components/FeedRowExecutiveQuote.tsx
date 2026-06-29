import type { ExecutiveSignal, FeedBill, RelatedExecutiveBill } from '../api/types'
import { CURRENT_PRESIDENT } from '../constants/president'
import { congressGovBillUrl, formatVoteDate } from '../utils/billLabels'
import {
  formatExecutiveRoleLabel,
  getBillColloquialName,
} from '../utils/executiveLabels'

type FeedRowExecutiveQuoteProps = {
  signal: ExecutiveSignal
  bill: FeedBill
  billHeadline?: string | null
  relatedBills?: RelatedExecutiveBill[]
}

/** Prefer verbatim post text; fall back to stored summary only when quote is missing. */
export function getExecutiveQuoteText(signal: ExecutiveSignal): string | null {
  const quote = signal.quote?.trim()
  if (quote) return quote
  const summary = signal.summary?.trim()
  return summary || null
}

export function FeedRowExecutiveQuote({
  signal,
  bill,
  billHeadline = null,
  relatedBills = [],
}: FeedRowExecutiveQuoteProps) {
  const quoteText = getExecutiveQuoteText(signal)
  if (!quoteText) return null

  const postedDate = formatVoteDate(signal.posted_at.slice(0, 10))
  const billName = getBillColloquialName({ ...bill, headline: billHeadline })
  const billUrl = congressGovBillUrl(bill.congress, bill.type, bill.number)
  const roleLabel = signal.role ? formatExecutiveRoleLabel(signal.role) : 'About this bill'

  return (
    <blockquote className="feed-row-executive-quote" cite={signal.source_url}>
      <header className="feed-row-executive-quote__header">
        <p className="feed-row-executive-quote__context">
          <span className="feed-row-executive-quote__context-label">{roleLabel}</span>
          <span className="feed-row-executive-quote__context-sep"> · </span>
          <a
            className="feed-row-executive-quote__bill-link congress-link"
            href={billUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {billName}
          </a>
        </p>
        {signal.rationale ? (
          <p className="feed-row-executive-quote__rationale">{signal.rationale}</p>
        ) : null}
        {relatedBills.length > 0 ? (
          <p className="feed-row-executive-quote__related-note">
            Same post also mentions{' '}
            {relatedBills.map((related, index) => {
              const relatedName = getBillColloquialName(related)
              const relatedUrl = congressGovBillUrl(related.congress, related.type, related.number)
              return (
                <span key={`${related.congress}-${related.type}-${related.number}`}>
                  {index > 0 ? '; ' : ''}
                  <a
                    className="feed-row-executive-quote__bill-link congress-link"
                    href={relatedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {relatedName}
                  </a>
                  {' · '}
                  {formatExecutiveRoleLabel(related.role)}
                </span>
              )
            })}
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

import { textContainsQuote } from '@congress-tracker/shared/quote-verification'

import {
  FEED_SUMMARY_PENDING,
  getFeedSummarySectionsModel,
  type FeedSummaryContent,
  type FeedSummaryPrimary,
} from '../utils/feedRowLabels'
import { QuoteHighlightText } from './QuoteHighlightText'

export type SummaryHighlight = {
  quote: string
  landing: boolean
}

type FeedSummarySectionsProps = {
  content: FeedSummaryContent
  /** Shared quote to mark in place (G2 landing). */
  highlight?: SummaryHighlight | null
}

/** True when the quote can be highlighted somewhere in the rendered summary. */
export function summaryContainsQuote(content: FeedSummaryContent, quote: string): boolean {
  const { primary, keyPoints, crsDisclosure } = getFeedSummarySectionsModel(content)
  const primaryText = primary.kind === 'what_it_does' || primary.kind === 'crs' ? primary.text : null
  return (
    textContainsQuote(primaryText, quote) ||
    keyPoints.some((point) => textContainsQuote(point, quote)) ||
    textContainsQuote(crsDisclosure, quote)
  )
}

function ScrollableCrsBody({
  text,
  label,
  highlight,
}: {
  text: string
  label: string
  highlight: SummaryHighlight | null
}) {
  return (
    <div
      className="feed-row-summary-body feed-row-summary-body--scrollable"
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      <p data-quotable="crs">
        <QuoteHighlightText text={text} quote={highlight?.quote} landing={highlight?.landing} />
      </p>
    </div>
  )
}

function PrimarySummarySection({
  primary,
  highlight,
}: {
  primary: FeedSummaryPrimary
  highlight: SummaryHighlight | null
}) {
  switch (primary.kind) {
    case 'pending':
      return (
        <section className="feed-row-detail-section">
          <p className="feed-row-summary-body feed-row-summary--pending">{FEED_SUMMARY_PENDING}</p>
        </section>
      )
    case 'what_it_does':
      return (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">What it does</h3>
          <p className="feed-row-summary-body" data-quotable="digest">
            <QuoteHighlightText
              text={primary.text}
              quote={highlight?.quote}
              landing={highlight?.landing}
            />
          </p>
        </section>
      )
    case 'crs':
      return (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">Summary</h3>
          <p className="feed-row-summary-body" data-quotable="crs">
            <QuoteHighlightText
              text={primary.text}
              quote={highlight?.quote}
              landing={highlight?.landing}
            />
          </p>
        </section>
      )
    case 'none':
      return null
    default: {
      const _exhaustive: never = primary
      return _exhaustive
    }
  }
}

export function FeedSummarySections({ content, highlight = null }: FeedSummarySectionsProps) {
  const { primary, keyPoints, crsDisclosure } = getFeedSummarySectionsModel(content)
  // A quote that lives only in the collapsed CRS text needs the disclosure open to be seen.
  const openCrs = Boolean(highlight && crsDisclosure && textContainsQuote(crsDisclosure, highlight.quote))

  return (
    <>
      <PrimarySummarySection primary={primary} highlight={highlight} />

      {keyPoints.length > 0 ? (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">Key points</h3>
          <ul className="feed-row-summary-bullets" aria-label="Key points">
            {keyPoints.map((point, index) => (
              <li key={`${index}-${point}`} data-quotable="digest">
                <QuoteHighlightText
                  text={point}
                  quote={highlight?.quote}
                  landing={highlight?.landing}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {crsDisclosure ? (
        <details className="feed-row-crs-details" open={openCrs || undefined}>
          <summary className="feed-row-crs-details-summary">Official CRS summary</summary>
          <ScrollableCrsBody text={crsDisclosure} label="Official CRS summary" highlight={highlight} />
        </details>
      ) : null}
    </>
  )
}

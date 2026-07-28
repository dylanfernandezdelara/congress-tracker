import {
  FEED_SUMMARY_PENDING,
  getFeedSummarySectionsModel,
  type FeedSummaryContent,
  type FeedSummaryPrimary,
} from '../utils/feedRowLabels'

type FeedSummarySectionsProps = {
  content: FeedSummaryContent
}

function ScrollableCrsBody({ text, label }: { text: string; label: string }) {
  return (
    <div
      className="feed-row-summary-body feed-row-summary-body--scrollable"
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      <p>{text}</p>
    </div>
  )
}

function PrimarySummarySection({ primary }: { primary: FeedSummaryPrimary }) {
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
          <p className="feed-row-summary-body">{primary.text}</p>
        </section>
      )
    case 'crs':
      return (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">Summary</h3>
          <p className="feed-row-summary-body feed-row-summary-body--crs">{primary.text}</p>
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

export function FeedSummarySections({ content }: FeedSummarySectionsProps) {
  const { primary, keyPoints, crsDisclosure } = getFeedSummarySectionsModel(content)

  return (
    <>
      <PrimarySummarySection primary={primary} />

      {keyPoints.length > 0 ? (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">Key points</h3>
          <ul className="feed-row-summary-bullets" aria-label="Key points">
            {keyPoints.map((point, index) => (
              <li key={`${index}-${point}`}>{point}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {crsDisclosure ? (
        <details className="feed-row-crs-details">
          <summary className="feed-row-crs-details-summary">Official CRS summary</summary>
          <ScrollableCrsBody text={crsDisclosure} label="Official CRS summary" />
        </details>
      ) : null}
    </>
  )
}

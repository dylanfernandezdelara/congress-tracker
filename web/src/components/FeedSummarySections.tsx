import type { CSSProperties } from 'react'
import type { BillDigestInsideRow } from '@congress-tracker/shared/digest-api-types'
import {
  FEED_SUMMARY_PENDING,
  getFeedSummarySectionsModel,
  type FeedSummaryContent,
  type FeedSummaryPrimary,
} from '../utils/feedRowLabels'

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
          <p className="feed-row-summary-body">{primary.text}</p>
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

function InsideSection({ rows }: { rows: BillDigestInsideRow[] }) {
  // Bars only when every part has a measured share; a partial set of bars would misstate the rest.
  const sized = rows.every((row) => row.share !== null)
  return (
    <section className="feed-row-detail-section">
      <h3 className="feed-row-detail-heading">What&rsquo;s inside</h3>
      <ul className="feed-row-inside" aria-label="What's inside">
        {rows.map((row, index) => (
          <li key={`${index}-${row.part}`} className="feed-row-inside-row">
            <div className="feed-row-inside-head">
              <span className="feed-row-inside-part">{row.part}</span>
              {sized && row.share !== null ? (
                <span className="feed-row-inside-share">{row.share < 1 ? '<1' : row.share}% of the bill</span>
              ) : null}
            </div>
            {sized && row.share !== null ? (
              <div className="feed-row-inside-bar" aria-hidden="true">
                <span style={{ '--share': `${Math.max(row.share, 1)}%` } as CSSProperties} />
              </div>
            ) : null}
            <p className="feed-row-inside-summary">{row.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

type FeedSummarySectionsProps = {
  content: FeedSummaryContent
  /** The bill's text on Congress.gov; key points link their section there. */
  textUrl?: string | null
}

export function FeedSummarySections({ content, textUrl = null }: FeedSummarySectionsProps) {
  const { primary, keyPoints, whoItAffects, inside, provisional, crsDisclosure } = getFeedSummarySectionsModel(content)

  return (
    <>
      <PrimarySummarySection primary={primary} />

      {provisional ? (
        <p className="feed-row-summary-provisional">
          Early summary from the bill&rsquo;s title. It updates when the full text is published.
        </p>
      ) : null}

      {whoItAffects.length > 0 ? (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">Who it affects</h3>
          <ul className="feed-row-affects" aria-label="Who it affects">
            {whoItAffects.map((group) => (
              <li key={group} className="feed-row-affects-chip">
                {group}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {keyPoints.length > 0 ? (
        <section className="feed-row-detail-section">
          <h3 className="feed-row-detail-heading">Key points</h3>
          <ul className="feed-row-summary-bullets" aria-label="Key points">
            {keyPoints.map((point, index) => (
              <li key={`${index}-${point.text}`}>
                {point.text}
                {point.section ? (
                  <>
                    {' '}
                    {textUrl ? (
                      <a
                        className="feed-row-section-ref"
                        href={textUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${point.section}, full bill text on Congress.gov (opens in a new tab)`}
                      >
                        {point.section}
                      </a>
                    ) : (
                      <span className="feed-row-section-ref">{point.section}</span>
                    )}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inside.length > 0 ? <InsideSection rows={inside} /> : null}

      {crsDisclosure ? (
        <details className="feed-row-crs-details">
          <summary className="feed-row-crs-details-summary">Official CRS summary</summary>
          <ScrollableCrsBody text={crsDisclosure} label="Official CRS summary" />
        </details>
      ) : null}
    </>
  )
}

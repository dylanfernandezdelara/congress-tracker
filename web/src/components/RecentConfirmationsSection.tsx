import { useId, useState } from 'react'

import { wikipediaExtractAddsDetail } from '@congress-tracker/shared/confirmation-about'

import type { RecentConfirmationItem } from '../api/types'
import { formatVoteDate } from '../utils/billLabels'
import { ExpandChevron } from './ExpandChevron'
import { FeedRowDate } from './FeedRowDate'

type RecentConfirmationsSectionProps = {
  confirmations: RecentConfirmationItem[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

function confirmationKey(item: RecentConfirmationItem): string {
  return `${item.chamber}:${item.congress}:${item.session}:${item.roll_number}`
}

function nomineeLabel(item: RecentConfirmationItem): string {
  if (item.nominee_names.length === 0) {
    return item.position_title?.trim() || 'Senate confirmation'
  }
  if (item.nominee_names.length === 1) {
    return item.nominee_names[0]!.display_name
  }
  return `${item.nominee_names[0]!.display_name} +${item.nominee_names.length - 1}`
}

function primaryNomineeName(item: RecentConfirmationItem): string | null {
  const name = item.nominee_names[0]?.display_name?.trim()
  return name || null
}

function confirmationHeadline(item: RecentConfirmationItem): string {
  const fromApi = item.headline?.trim()
  if (fromApi) return fromApi
  const name = nomineeLabel(item)
  const role = item.position_title?.trim()
  if (role && item.nominee_names.length > 0) return `${name} confirmed as ${role}`
  return name
}

type ConfirmationItemRowProps = {
  item: RecentConfirmationItem
  isExpanded: boolean
  onToggle: (key: string) => void
}

function ConfirmationItemRow({ item, isExpanded, onToggle }: ConfirmationItemRowProps) {
  const detailId = useId()
  const headlineId = useId()
  const key = confirmationKey(item)
  const headline = confirmationHeadline(item)
  const officialAbout = item.background?.trim() || null
  const wikiExtract = item.wikipedia_extract?.trim() || null
  const showWikiExtract = wikipediaExtractAddsDetail(officialAbout, wikiExtract)
  const organization = item.organization?.trim() || null
  const margin = item.yeas - item.nays
  const wikiArticleUrl = item.wikipedia_url?.trim() || null
  const accessibleName = primaryNomineeName(item) || headline

  return (
    <li className={`feed-row${isExpanded ? ' is-expanded' : ''}`}>
      <article className="feed-row-article" aria-labelledby={headlineId}>
        <button
          type="button"
          className="feed-row-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${accessibleName}`}
          onClick={() => onToggle(key)}
        >
          <FeedRowDate dateTime={item.vote_date} primary={formatVoteDate(item.vote_date)} />
          <div className="feed-row-main">
            <div className="feed-row-header">
              <h3 id={headlineId} className="feed-row-topic">
                {headline}
              </h3>
              <ExpandChevron />
            </div>
            <div className="feed-row-meta-row">
              <span className="feed-row-badge feed-row-badge--passed text-pass">Confirmed</span>
              <span className="feed-row-chip feed-row-chip--margin">
                {item.yeas}–{item.nays}
                {margin !== 0 ? ` · ${margin > 0 ? '+' : ''}${margin}` : ''}
              </span>
              {organization ? <span className="feed-row-chip">{organization}</span> : null}
            </div>
          </div>
        </button>

        <div
          id={detailId}
          className="feed-row-detail-panel"
          role="region"
          aria-label={`Details for ${accessibleName}`}
          hidden={!isExpanded}
        >
          {isExpanded ? (
            <div className="recent-confirmations-detail">
              {officialAbout ? (
                <section className="recent-confirmations-detail-block">
                  <h4 className="recent-confirmations-detail-label">About</h4>
                  <p className="recent-confirmations-detail-text">{officialAbout}</p>
                </section>
              ) : null}
              {showWikiExtract && wikiExtract ? (
                <section className="recent-confirmations-detail-block">
                  <h4 className="recent-confirmations-detail-label">More background</h4>
                  <p className="recent-confirmations-detail-text">{wikiExtract}</p>
                  <p className="recent-confirmations-detail-source">From Wikipedia</p>
                </section>
              ) : null}
              {!officialAbout && !showWikiExtract ? (
                <p className="text-[13px] text-secondary">
                  Confirmation details are still being prepared.
                </p>
              ) : null}
              <div className="recent-confirmations-links">
                <a
                  href={item.congress_gov_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="congress-link"
                >
                  Congress.gov ↗
                </a>
                {wikiArticleUrl ? (
                  <a
                    href={wikiArticleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="congress-link"
                  >
                    Wikipedia ↗
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </article>
    </li>
  )
}

export function RecentConfirmationsSection({
  confirmations,
  loading = false,
  error = null,
  onRetry,
}: RecentConfirmationsSectionProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const handleToggle = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  if (error) {
    return (
      <section className="recent-confirmations" aria-label="Recent confirmations">
        <p className="text-[13px] text-secondary">{error}</p>
        {onRetry ? (
          <button type="button" className="ghost-button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </section>
    )
  }

  if (loading && !confirmations) {
    return (
      <section className="recent-confirmations" aria-label="Recent confirmations">
        <p className="text-[12px] text-faint">Loading confirmations…</p>
      </section>
    )
  }

  if (!confirmations || confirmations.length === 0) {
    return null
  }

  return (
    <section className="recent-confirmations" aria-label="Recent confirmations">
      <h2 className="recent-confirmations-title">Recent confirmations</h2>
      <ul className="feed-list">
        {confirmations.map((item) => {
          const key = confirmationKey(item)
          return (
            <ConfirmationItemRow
              key={key}
              item={item}
              isExpanded={expandedKey === key}
              onToggle={handleToggle}
            />
          )
        })}
      </ul>
    </section>
  )
}

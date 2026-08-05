import { useId, useState } from 'react'

import {
  confirmationAboutTeaser,
  confirmationOppositionNote,
  selectConfirmationAbout,
} from '@congress-tracker/shared/confirmation-about'

import type { RecentConfirmationItem } from '../api/types'
import { formatVoteDate } from '../utils/billLabels'
import { formatPartySplits } from '../utils/partySplit'
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

function voteChipLabel(item: RecentConfirmationItem): string {
  const party = formatPartySplits(item.party_splits ?? [])
  if (party) return party
  const margin = item.yeas - item.nays
  return margin === 0
    ? `${item.yeas}–${item.nays}`
    : `${item.yeas}–${item.nays} · ${margin > 0 ? '+' : ''}${margin}`
}

function ConfirmationItemRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: RecentConfirmationItem
  isExpanded: boolean
  onToggle: (key: string) => void
}) {
  const detailId = useId()
  const headlineId = useId()
  const key = confirmationKey(item)
  const headline = item.headline?.trim() || 'Senate confirmation'
  const accessibleName = item.nominee_names[0]?.display_name?.trim() || headline
  const about = selectConfirmationAbout({
    officialAbout: item.background,
    wikipediaExtract: item.wikipedia_extract,
  })
  const opposition = confirmationOppositionNote(item.party_splits ?? [])
  const organization = item.organization?.trim() || null
  const voteLabel = voteChipLabel(item)
  const wikiArticleUrl = item.wikipedia_url?.trim() || null
  // "Who this is" without expanding — first non-nominated sentence of the blurb.
  const aboutTeaser = confirmationAboutTeaser(about.text)

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
              <span className="feed-row-chip feed-row-chip--margin">{voteLabel}</span>
              {organization ? <span className="feed-row-chip">{organization}</span> : null}
            </div>

            {!isExpanded && aboutTeaser ? (
              <p className="feed-row-teaser">{aboutTeaser}</p>
            ) : null}
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
              {about.text ? (
                <section className="recent-confirmations-detail-block">
                  <h4 className="recent-confirmations-detail-label">About</h4>
                  <p className="recent-confirmations-detail-text">{about.text}</p>
                  {about.source === 'wikipedia' ? (
                    <p className="recent-confirmations-detail-source">From Wikipedia</p>
                  ) : null}
                </section>
              ) : null}
              {opposition ? (
                <section className="recent-confirmations-detail-block">
                  <h4 className="recent-confirmations-detail-label">Vote</h4>
                  <p className="recent-confirmations-detail-text">{opposition}</p>
                </section>
              ) : null}
              {!about.text && !opposition ? (
                <p className="text-[13px] text-secondary">
                  Confirmation details are still being prepared.
                </p>
              ) : null}
              <p className="recent-confirmations-sources">
                <a
                  href={item.congress_gov_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="recent-confirmations-source-link"
                >
                  Congress.gov
                </a>
                {wikiArticleUrl ? (
                  <>
                    <span className="recent-confirmations-source-sep" aria-hidden="true">
                      ·
                    </span>
                    <a
                      href={wikiArticleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="recent-confirmations-source-link"
                    >
                      Wikipedia
                    </a>
                  </>
                ) : null}
              </p>
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

  if (!confirmations || confirmations.length === 0) return null

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
              onToggle={(next) => setExpandedKey((prev) => (prev === next ? null : next))}
            />
          )
        })}
      </ul>
    </section>
  )
}

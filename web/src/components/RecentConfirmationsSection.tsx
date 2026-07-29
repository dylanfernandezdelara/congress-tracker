import { useId, useState } from 'react'

import type { RecentConfirmationItem } from '../api/types'
import { formatVoteDate } from '../utils/billLabels'

type RecentConfirmationsSectionProps = {
  confirmations: RecentConfirmationItem[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

function ExpandChevron() {
  return (
    <span className="feed-row-chevron" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" focusable="false">
        <path
          d="M6 3.5 10.5 8 6 12.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function confirmationKey(item: RecentConfirmationItem): string {
  return `${item.chamber}:${item.congress}:${item.session}:${item.roll_number}`
}

function nomineeLabel(item: RecentConfirmationItem): string {
  if (item.nominee_names.length === 0) return item.citation
  if (item.nominee_names.length === 1) {
    const nominee = item.nominee_names[0]!
    return nominee.state ? `${nominee.display_name} (${nominee.state})` : nominee.display_name
  }
  return `${item.nominee_names[0]!.display_name} +${item.nominee_names.length - 1}`
}

function roleLine(item: RecentConfirmationItem): string | null {
  if (item.position_title?.trim() && item.organization?.trim()) {
    return `${item.position_title.trim()} · ${item.organization.trim()}`
  }
  return item.position_title?.trim() || item.organization?.trim() || null
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
  const headline = item.headline?.trim() || nomineeLabel(item)
  const role = roleLine(item)
  const margin = item.yeas - item.nays

  return (
    <li className={`feed-row${isExpanded ? ' is-expanded' : ''}`}>
      <article className="feed-row-article" aria-labelledby={headlineId}>
        <button
          type="button"
          className="feed-row-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${item.citation}`}
          onClick={() => onToggle(key)}
        >
          <div className="feed-row-main">
            <div className="feed-row-header">
              <h3 id={headlineId} className="feed-row-topic">
                {headline}
              </h3>
              <span className="feed-row-date-wrap">
                <time className="feed-row-date" dateTime={item.vote_date}>
                  {formatVoteDate(item.vote_date)}
                </time>
                <ExpandChevron />
              </span>
            </div>
            <div className="feed-row-meta-row">
              <span className="feed-row-badge feed-row-badge--passed text-pass">Confirmed</span>
              <span className="feed-row-chip">Senate</span>
              <span className="feed-row-chip feed-row-chip--margin">
                {item.yeas}–{item.nays}
                {margin !== 0 ? ` · ${margin > 0 ? '+' : ''}${margin}` : ''}
              </span>
              <span className="feed-row-chip">{item.citation}</span>
            </div>
            {role ? <p className="recent-confirmations-role">{role}</p> : null}
          </div>
        </button>

        <div
          id={detailId}
          className="feed-row-detail-panel"
          role="region"
          aria-label={`Details for ${item.citation}`}
          hidden={!isExpanded}
        >
          {isExpanded ? (
            <div className="recent-confirmations-detail">
              {item.what_was_confirmed ? (
                <section className="recent-confirmations-detail-block">
                  <h4 className="recent-confirmations-detail-label">What was confirmed</h4>
                  <p className="recent-confirmations-detail-text">{item.what_was_confirmed}</p>
                </section>
              ) : null}
              {item.background ? (
                <section className="recent-confirmations-detail-block">
                  <h4 className="recent-confirmations-detail-label">Background</h4>
                  <p className="recent-confirmations-detail-text">{item.background}</p>
                </section>
              ) : null}
              {item.key_points.length > 0 ? (
                <section className="recent-confirmations-detail-block">
                  <h4 className="recent-confirmations-detail-label">Key points</h4>
                  <ul className="recent-confirmations-detail-points">
                    {item.key_points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {!item.what_was_confirmed && !item.background ? (
                <p className="text-[13px] text-secondary">
                  Confirmation details are still being prepared.
                </p>
              ) : null}
              <a
                href={item.congress_gov_url}
                target="_blank"
                rel="noopener noreferrer"
                className="congress-link"
              >
                Read on congress.gov ↗
              </a>
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

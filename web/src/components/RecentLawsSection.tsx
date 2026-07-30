import { useId, useState } from 'react'
import { Link } from 'react-router-dom'

import { VOTE_LOOKBACK_DAYS } from '@congress-tracker/shared/feed-constants'
import type { BillLawKind } from '@congress-tracker/shared/lifecycle-api-types'
import { daysAgoLookbackStartIso } from '@congress-tracker/shared/lookback'

import type { RecentLawItem } from '../api/types'
import { formatBillQueryParam } from '../utils/billDeepLink'
import { congressGovBillUrl, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { mapLawKind } from '../utils/billLifecycleStages'
import { TERMINAL_STATUS_PRESENTATION } from '../utils/terminalStatusPresentation'
import { BillIdChip } from './BillIdChip'
import { ExpandChevron } from './ExpandChevron'
import { FeedRowDetail } from './FeedRowDetail'

type RecentLawsSectionProps = {
  laws: RecentLawItem[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

function recentLawOutcome(lawKind: BillLawKind | null): {
  feedKind: 'law' | 'law_unsigned' | 'vetoed'
  label: string
  badgeToneClass: string
} {
  if (!lawKind) {
    const presentation = TERMINAL_STATUS_PRESENTATION.became_law
    return {
      feedKind: presentation.feedKind,
      label: presentation.pipelineLabel,
      badgeToneClass: ' text-law',
    }
  }
  const status = mapLawKind(lawKind)
  const presentation = TERMINAL_STATUS_PRESENTATION[status]
  const label =
    status === 'became_law_unsigned' ? 'Law without signature' : presentation.pipelineLabel
  const badgeToneClass = presentation.feedKind === 'vetoed' ? ' text-fail' : ' text-law'
  return { feedKind: presentation.feedKind, label, badgeToneClass }
}

function formatPublicLawLabel(publicLaw: string): string {
  const trimmed = publicLaw.trim()
  if (/^public\s+law\b/i.test(trimmed)) return trimmed
  return `Public Law ${trimmed}`
}

function lawItemKey(law: RecentLawItem): string {
  return formatBillQueryParam({
    congress: law.congress,
    type: law.bill_type,
    number: law.bill_number,
  })
}

function billDeepLinkTo(law: RecentLawItem): string {
  return `/?bill=${lawItemKey(law)}`
}

/** True when a passage vote is still inside the feed lookback window. */
export function isPassageVoteInFeedWindow(
  voteDate: string | null,
  asOf: Date = new Date(),
): boolean {
  if (!voteDate) return false
  return voteDate >= daysAgoLookbackStartIso(VOTE_LOOKBACK_DAYS, asOf)
}

type RecentLawItemRowProps = {
  law: RecentLawItem
  isExpanded: boolean
  onToggle: (key: string) => void
}

function RecentLawItemRow({ law, isExpanded, onToggle }: RecentLawItemRowProps) {
  const detailId = useId()
  const headlineId = useId()
  const key = lawItemKey(law)
  const billId = formatShortBillId(law.bill_type, law.bill_number)
  const headline = law.headline?.trim() || law.title?.trim() || billId
  const outcome = recentLawOutcome(law.law_kind)
  const sourceUrl = congressGovBillUrl(law.congress, law.bill_type, law.bill_number)
  const showTimelineLink = isPassageVoteInFeedWindow(law.latest_passage_vote_date)

  return (
    <li className={`feed-row${isExpanded ? ' is-expanded' : ''}`}>
      <article className="feed-row-article" aria-labelledby={headlineId}>
        <button
          type="button"
          className="feed-row-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${billId}`}
          onClick={() => onToggle(key)}
        >
          <time className="feed-row-date" dateTime={law.became_law_date}>
            <span className="feed-row-date-primary">{formatVoteDate(law.became_law_date)}</span>
          </time>
          <div className="feed-row-main">
            <div className="feed-row-header">
              <h3 id={headlineId} className="feed-row-topic">
                {headline}
              </h3>
              <ExpandChevron />
            </div>
            <div className="feed-row-meta-row">
              <span
                className={`feed-row-badge feed-row-badge--${outcome.feedKind}${outcome.badgeToneClass}`}
              >
                {outcome.label}
              </span>
              {law.public_law ? (
                <span className="feed-row-chip">{formatPublicLawLabel(law.public_law)}</span>
              ) : null}
              <BillIdChip type={law.bill_type} number={law.bill_number} />
            </div>
          </div>
        </button>

        <div
          id={detailId}
          className="feed-row-detail-panel"
          role="region"
          aria-label={`Details for ${billId}`}
          hidden={!isExpanded}
        >
          {isExpanded ? (
            law.item ? (
              <>
                <FeedRowDetail
                  item={law.item}
                  shareUrl={showTimelineLink ? undefined : sourceUrl}
                />
                {showTimelineLink ? (
                  <p className="recent-laws-timeline-link">
                    <Link to={billDeepLinkTo(law)}>View in timeline</Link>
                  </p>
                ) : null}
              </>
            ) : (
              <div className="recent-laws-detail-fallback">
                <p className="text-[13px] text-secondary">Couldn&apos;t find bill details.</p>
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="congress-link"
                >
                  Read on congress.gov ↗
                </a>
              </div>
            )
          ) : null}
        </div>
      </article>
    </li>
  )
}

export function RecentLawsSection({
  laws,
  loading = false,
  error = null,
  onRetry,
}: RecentLawsSectionProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const handleToggle = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  if (error) {
    return (
      <section className="recent-laws" aria-label="New laws">
        <p className="text-[13px] text-secondary">{error}</p>
        {onRetry ? (
          <button type="button" className="ghost-button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </section>
    )
  }

  if (loading && !laws) {
    return (
      <section className="recent-laws" aria-label="New laws">
        <p className="text-[12px] text-faint">Loading new laws…</p>
      </section>
    )
  }

  if (!laws || laws.length === 0) {
    return null
  }

  return (
    <section className="recent-laws" aria-label="New laws">
      <h2 className="recent-laws-title">New laws</h2>
      <ul className="feed-list">
        {laws.map((law) => {
          const key = lawItemKey(law)
          return (
            <RecentLawItemRow
              key={key}
              law={law}
              isExpanded={expandedKey === key}
              onToggle={handleToggle}
            />
          )
        })}
      </ul>
    </section>
  )
}

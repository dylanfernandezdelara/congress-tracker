import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { VOTE_LOOKBACK_DAYS } from '@congress-tracker/shared/feed-constants'
import type { BillLawKind } from '@congress-tracker/shared/lifecycle-api-types'
import { daysAgoLookbackStartIso } from '@congress-tracker/shared/lookback'

import { fetchFeedBill } from '../api/client'
import type { FeedItem, RecentLawItem } from '../api/types'
import { assertNever } from '../utils/assertNever'
import { formatBillQueryParam } from '../utils/billDeepLink'
import { congressGovBillUrl, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { TERMINAL_STATUS_PRESENTATION } from '../utils/terminalStatusPresentation'
import { FeedRowDetail } from './FeedRowDetail'

type RecentLawsSectionProps = {
  laws: RecentLawItem[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

type DetailCacheEntry =
  | { status: 'loading' }
  | { status: 'ready'; item: FeedItem }
  | { status: 'missing' }
  | { status: 'error'; message: string }

function recentLawOutcomeLabel(lawKind: BillLawKind | null): string {
  if (!lawKind) return TERMINAL_STATUS_PRESENTATION.became_law.pipelineLabel
  switch (lawKind) {
    case 'signed':
      return TERMINAL_STATUS_PRESENTATION.became_law_signed.pipelineLabel
    case 'law_unsigned':
      return TERMINAL_STATUS_PRESENTATION.became_law_unsigned.pipelineLabel
    case 'enacted_over_veto':
      return TERMINAL_STATUS_PRESENTATION.enacted_over_veto.pipelineLabel
    case 'vetoed':
      return TERMINAL_STATUS_PRESENTATION.vetoed.pipelineLabel
    case 'pocket_vetoed':
      return TERMINAL_STATUS_PRESENTATION.pocket_vetoed.pipelineLabel
    default:
      return assertNever(lawKind)
  }
}

function formatPublicLawLabel(publicLaw: string): string {
  const trimmed = publicLaw.trim()
  if (/^public\s+law\b/i.test(trimmed)) return trimmed
  return `Public Law ${trimmed}`
}

function lawItemKey(law: RecentLawItem): string {
  return `${law.congress}-${law.bill_type}-${law.bill_number}`
}

function billDeepLinkTo(law: RecentLawItem): string {
  const bill = formatBillQueryParam({
    congress: law.congress,
    type: law.bill_type,
    number: law.bill_number,
  })
  return `/?bill=${bill}`
}

/** True when a passage vote is still inside the feed lookback window. */
export function isPassageVoteInFeedWindow(
  voteDate: string | null,
  asOf: Date = new Date(),
): boolean {
  if (!voteDate) return false
  return voteDate >= daysAgoLookbackStartIso(VOTE_LOOKBACK_DAYS, asOf)
}

function ExpandChevron() {
  return (
    <span className="recent-laws-chevron" aria-hidden="true">
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

type RecentLawItemRowProps = {
  law: RecentLawItem
  isExpanded: boolean
  detail: DetailCacheEntry | undefined
  onToggle: (key: string) => void
  onRetryDetail: (law: RecentLawItem) => void
}

function RecentLawItemRow({
  law,
  isExpanded,
  detail,
  onToggle,
  onRetryDetail,
}: RecentLawItemRowProps) {
  const detailId = useId()
  const key = lawItemKey(law)
  const billId = formatShortBillId(law.bill_type, law.bill_number)
  const headline = law.headline?.trim() || law.title?.trim() || billId
  const outcome = recentLawOutcomeLabel(law.law_kind)
  const sourceUrl = congressGovBillUrl(law.congress, law.bill_type, law.bill_number)
  const showTimelineLink = isPassageVoteInFeedWindow(law.latest_passage_vote_date)
  const metaParts = [outcome]
  if (law.public_law) metaParts.push(formatPublicLawLabel(law.public_law))
  metaParts.push(formatVoteDate(law.became_law_date))

  return (
    <li className={`recent-laws-item${isExpanded ? ' is-expanded' : ''}`}>
      <article className="recent-laws-article">
        <button
          type="button"
          className="recent-laws-toggle"
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${billId}`}
          onClick={() => onToggle(key)}
        >
          <div className="recent-laws-toggle-main">
            <p className="recent-laws-headline">
              <span className="recent-laws-bill-id">{billId}</span>
              <span className="recent-laws-headline-sep"> — </span>
              <span className="recent-laws-headline-text">{headline}</span>
            </p>
            <ExpandChevron />
          </div>
          <p className="recent-laws-meta">{metaParts.join(' · ')}</p>
        </button>

        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="recent-laws-congress-link congress-link"
        >
          congress.gov ↗
        </a>

        <div
          id={detailId}
          className="recent-laws-detail-panel feed-row-detail-panel"
          role="region"
          aria-label={`Details for ${billId}`}
          hidden={!isExpanded}
        >
          {isExpanded ? (
            <>
              {detail?.status === 'loading' || !detail ? (
                <p className="text-[12px] text-faint">Loading bill details…</p>
              ) : null}
              {detail?.status === 'error' || detail?.status === 'missing' ? (
                <div className="recent-laws-detail-fallback">
                  <p className="text-[13px] text-secondary">
                    {detail.status === 'missing'
                      ? "Couldn't find bill details."
                      : detail.message}
                  </p>
                  <div className="recent-laws-detail-fallback-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onRetryDetail(law)}
                    >
                      Retry
                    </button>
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="congress-link"
                    >
                      Read on congress.gov ↗
                    </a>
                  </div>
                </div>
              ) : null}
              {detail?.status === 'ready' ? (
                <>
                  <FeedRowDetail
                    item={detail.item}
                    shareUrl={showTimelineLink ? undefined : sourceUrl}
                  />
                  {showTimelineLink ? (
                    <p className="recent-laws-timeline-link">
                      <Link to={billDeepLinkTo(law)}>View in timeline</Link>
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
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
  const [detailCache, setDetailCache] = useState<Record<string, DetailCacheEntry>>({})
  const detailCacheRef = useRef(detailCache)
  detailCacheRef.current = detailCache

  const loadDetail = (law: RecentLawItem) => {
    const key = lawItemKey(law)
    setDetailCache((prev) => ({ ...prev, [key]: { status: 'loading' } }))
    return fetchFeedBill({
      congress: law.congress,
      type: law.bill_type,
      number: law.bill_number,
    })
      .then((response) => {
        const item = response.item
        if (!item) {
          setDetailCache((prev) => ({ ...prev, [key]: { status: 'missing' } }))
          return
        }
        setDetailCache((prev) => ({ ...prev, [key]: { status: 'ready', item } }))
      })
      .catch(() => {
        setDetailCache((prev) => ({
          ...prev,
          [key]: { status: 'error', message: "Couldn't load bill details." },
        }))
      })
  }

  useEffect(() => {
    if (!expandedKey || !laws) return
    const law = laws.find((entry) => lawItemKey(entry) === expandedKey)
    if (!law) return

    const cached = detailCacheRef.current[expandedKey]
    if (cached?.status === 'ready' || cached?.status === 'loading') return

    void loadDetail(law)
  }, [expandedKey, laws])

  const handleToggle = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  const handleRetryDetail = (law: RecentLawItem) => {
    setExpandedKey(lawItemKey(law))
    void loadDetail(law)
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
      <ul className="recent-laws-list">
        {laws.map((law) => {
          const key = lawItemKey(law)
          return (
            <RecentLawItemRow
              key={key}
              law={law}
              isExpanded={expandedKey === key}
              detail={detailCache[key]}
              onToggle={handleToggle}
              onRetryDetail={handleRetryDetail}
            />
          )
        })}
      </ul>
    </section>
  )
}

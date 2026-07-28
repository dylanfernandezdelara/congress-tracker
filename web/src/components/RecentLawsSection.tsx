import { Link } from 'react-router-dom'

import { VOTE_LOOKBACK_DAYS } from '@congress-tracker/shared/feed-constants'
import type { BillLawKind } from '@congress-tracker/shared/lifecycle-api-types'
import { daysAgoLookbackStartIso } from '@congress-tracker/shared/lookback'

import type { RecentLawItem } from '../api/types'
import { assertNever } from '../utils/assertNever'
import { formatBillQueryParam } from '../utils/billDeepLink'
import { congressGovBillUrl, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { TERMINAL_STATUS_PRESENTATION } from '../utils/terminalStatusPresentation'

type RecentLawsSectionProps = {
  laws: RecentLawItem[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

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

function RecentLawItemRow({ law }: { law: RecentLawItem }) {
  const billId = formatShortBillId(law.bill_type, law.bill_number)
  const headline = law.headline?.trim() || law.title?.trim() || billId
  const outcome = recentLawOutcomeLabel(law.law_kind)
  const sourceUrl = congressGovBillUrl(law.congress, law.bill_type, law.bill_number)
  const linkInFeed = isPassageVoteInFeedWindow(law.latest_passage_vote_date)
  const metaParts = [outcome]
  if (law.public_law) metaParts.push(formatPublicLawLabel(law.public_law))
  metaParts.push(formatVoteDate(law.became_law_date))

  const titleInner = (
    <>
      <span className="recent-laws-bill-id">{billId}</span>
      <span className="recent-laws-headline-sep"> — </span>
      <span className="recent-laws-headline-text">{headline}</span>
    </>
  )

  return (
    <li className="recent-laws-item">
      <p className="recent-laws-headline">
        {linkInFeed ? (
          <Link
            to={billDeepLinkTo(law)}
            className="recent-laws-feed-link"
            aria-label={`Open ${billId} in the feed`}
          >
            {titleInner}
          </Link>
        ) : (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="recent-laws-feed-link congress-link"
            aria-label={`Read ${billId} on congress.gov`}
          >
            {titleInner}
          </a>
        )}
      </p>
      <p className="recent-laws-meta">{metaParts.join(' · ')}</p>
      {linkInFeed ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="recent-laws-congress-link congress-link"
        >
          congress.gov ↗
        </a>
      ) : null}
    </li>
  )
}

export function RecentLawsSection({
  laws,
  loading = false,
  error = null,
  onRetry,
}: RecentLawsSectionProps) {
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
        {laws.map((law) => (
          <RecentLawItemRow
            key={`${law.congress}-${law.bill_type}-${law.bill_number}`}
            law={law}
          />
        ))}
      </ul>
    </section>
  )
}

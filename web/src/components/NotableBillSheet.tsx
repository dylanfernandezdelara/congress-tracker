import { useId } from 'react'

import { normalizeDigestBullets } from '@congress-tracker/shared/feed-content'
import type { NotableVoteEntry } from '../api/types'
import { congressGovBillUrl, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import type { FeedSummaryContent } from '../utils/feedRowLabels'
import { AnimatedSheet } from './AnimatedSheet'
import { FeedSummarySections } from './FeedSummarySections'
import type { MemberProfileSeed } from './MemberProfile'
import { NotableVoteDefectors } from './NotableVoteDefectors'

type NotableBillSheetProps = {
  open: boolean
  entry: NotableVoteEntry | null
  selectionKey: number
  onClose: () => void
  onOpenProfile: (seed: MemberProfileSeed) => void
}

function billTitle(entry: NotableVoteEntry): string {
  const billLabel = formatShortBillId(entry.bill_type, entry.bill_number)
  return entry.headline ?? `${billLabel} passage vote`
}

function summaryFromEntry(entry: NotableVoteEntry): FeedSummaryContent {
  const whatItDoes = entry.what_it_does?.trim() || null
  const keyPoints = normalizeDigestBullets(entry.key_points)
  const crsSummary = entry.raw_summary_text?.trim() || null
  return {
    whatItDoes,
    keyPoints,
    crsSummary,
    pending: !whatItDoes && keyPoints.length === 0 && !crsSummary,
  }
}

export function NotableBillSheet({
  open,
  entry,
  selectionKey,
  onClose,
  onOpenProfile,
}: NotableBillSheetProps) {
  const titleId = useId()

  if (!entry) return null

  const title = billTitle(entry)
  const billId = formatShortBillId(entry.bill_type, entry.bill_number)
  const sourceUrl = congressGovBillUrl(entry.congress, entry.bill_type, entry.bill_number)
  const summary = summaryFromEntry(entry)

  return (
    <AnimatedSheet
      open={open}
      selectionKey={selectionKey}
      onClose={onClose}
      titleId={titleId}
      closeAriaLabel="Close bill details"
      panelClassName="notable-bill-sheet"
    >
      <header className="notable-bill-sheet-header">
        <p className="notable-bill-sheet-bill-id">{billId}</p>
        <h2 id={titleId} className="notable-bill-sheet-title">
          {title}
        </h2>
        <p className="notable-bill-sheet-meta">
          {entry.chamber} · {formatVoteDate(entry.vote_date)} · {entry.yeas}–{entry.nays} (
          {entry.margin})
        </p>
        {entry.why_it_matters ? (
          <p className="notable-bill-sheet-why">{entry.why_it_matters}</p>
        ) : null}
      </header>

      <FeedSummarySections content={summary} />

      <section className="member-profile-section" aria-label="Party-line breaks">
        <h3 className="member-profile-section-title">Party-line breaks</h3>
        <NotableVoteDefectors
          entry={entry}
          onOpenProfile={onOpenProfile}
          emptyClassName="member-profile-muted"
        />
      </section>

      <a
        className="member-profile-link congress-link"
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Read on congress.gov ↗
      </a>
    </AnimatedSheet>
  )
}

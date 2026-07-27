import { useId } from 'react'

import type { NotableVoteEntry } from '../api/types'
import { congressGovBillUrl, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { toFeedSummaryContent } from '../utils/feedRowLabels'
import { notableVoteTitle } from '../utils/notableVoteLabels'
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

export function NotableBillSheet({
  open,
  entry,
  selectionKey,
  onClose,
  onOpenProfile,
}: NotableBillSheetProps) {
  const titleId = useId()

  if (!entry) return null

  const title = notableVoteTitle(entry)
  const billId = formatShortBillId(entry.bill_type, entry.bill_number)
  const sourceUrl = congressGovBillUrl(entry.congress, entry.bill_type, entry.bill_number)
  const summary = toFeedSummaryContent(entry)

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

      <section className="sheet-section" aria-label="Party-line breaks">
        <h3 className="sheet-section-title">Party-line breaks</h3>
        <NotableVoteDefectors
          entry={entry}
          onOpenProfile={onOpenProfile}
          emptyClassName="sheet-muted"
        />
      </section>

      <a
        className="sheet-link congress-link"
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Read on congress.gov ↗
      </a>
    </AnimatedSheet>
  )
}

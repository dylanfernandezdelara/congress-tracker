import { useEffect, useId, useRef, useState } from 'react'

import { fetchFeed } from '../api/client'
import type { FeedItem, NotableVoteEntry } from '../api/types'
import { FEED_MAX_PAGE_SIZE } from '../constants/feed'
import { congressGovBillUrl, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { formatBillQueryParam, itemMatchesBillParam } from '../utils/billDeepLink'
import { getFeedSummaryContent } from '../utils/feedRowLabels'
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

type DigestPhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; item: FeedItem }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

function billTitle(entry: NotableVoteEntry): string {
  const billLabel = formatShortBillId(entry.bill_type, entry.bill_number)
  return entry.headline ?? `${billLabel} passage vote`
}

async function loadFeedItemForNotable(entry: NotableVoteEntry): Promise<FeedItem | null> {
  const billParam = formatBillQueryParam({
    congress: entry.congress,
    type: entry.bill_type,
    number: entry.bill_number,
  })
  // Use the worker max page size: bill-id search is prefix-based, so a short
  // id like "S. 2" can match many siblings (S. 20–S. 29, …) ahead of the exact bill.
  const page = await fetchFeed({
    limit: FEED_MAX_PAGE_SIZE,
    offset: 0,
    q: formatShortBillId(entry.bill_type, entry.bill_number),
  })
  return page.items.find((item) => itemMatchesBillParam(item, billParam)) ?? null
}

export function NotableBillSheet({
  open,
  entry,
  selectionKey,
  onClose,
  onOpenProfile,
}: NotableBillSheetProps) {
  const titleId = useId()
  const [digest, setDigest] = useState<DigestPhase>({ kind: 'idle' })
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!open || !entry) {
      setDigest({ kind: 'idle' })
      return
    }

    const requestId = ++requestIdRef.current
    setDigest({ kind: 'loading' })
    let cancelled = false

    void loadFeedItemForNotable(entry)
      .then((item) => {
        if (cancelled || requestId !== requestIdRef.current) return
        setDigest(item ? { kind: 'ready', item } : { kind: 'missing' })
      })
      .catch(() => {
        if (cancelled || requestId !== requestIdRef.current) return
        setDigest({ kind: 'error', message: "Couldn't load the bill summary." })
      })

    return () => {
      cancelled = true
    }
  }, [open, entry, selectionKey])

  if (!entry) return null

  const title = billTitle(entry)
  const billId = formatShortBillId(entry.bill_type, entry.bill_number)
  const sourceUrl = congressGovBillUrl(entry.congress, entry.bill_type, entry.bill_number)
  const summary = digest.kind === 'ready' ? getFeedSummaryContent(digest.item) : null

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

      {digest.kind === 'loading' || digest.kind === 'idle' ? (
        <p className="member-profile-muted">Loading plain-English summary…</p>
      ) : null}
      {digest.kind === 'error' ? (
        <p className="member-profile-muted">{digest.message}</p>
      ) : null}
      {digest.kind === 'missing' ? (
        <p className="member-profile-muted">
          No plain-English summary is in the recent feed for this bill.
        </p>
      ) : null}
      {summary ? <FeedSummarySections content={summary} /> : null}

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

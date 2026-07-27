import { useEffect, useId, useRef, useState } from 'react'

import { fetchFeed } from '../api/client'
import { prefetchMemberProfile } from '../api/memberProfileCache'
import type { FeedItem, NotableVoteEntry } from '../api/types'
import { partyCssClass, partyShortLabel } from '@congress-tracker/shared/party'
import { crossVoteHint } from '@congress-tracker/shared/notable-votes'
import {
  MEMBER_VOTES_UNAVAILABLE,
  noPartyDefectorsMessage,
} from '../constants/memberVotesCopy'
import { useAnimatedDismiss } from '../hooks/useAnimatedDismiss'
import { congressGovBillUrl, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { formatBillQueryParam, itemMatchesBillParam } from '../utils/billDeepLink'
import { getFeedSummaryContent } from '../utils/feedRowLabels'
import { FeedSummarySections } from './FeedSummarySections'
import { MemberAvatar } from './MemberAvatar'
import type { MemberProfileSeed } from './MemberProfile'

type NotableBillSheetProps = {
  open: boolean
  entry: NotableVoteEntry | null
  selectionKey: number
  onClose: () => void
  onOpenProfile: (seed: MemberProfileSeed) => void
}

const EXIT_ANIMATION_FALLBACK_MS = 400
const EXIT_ANIMATION_NAME = 'member-profile-sink'

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
  const q = formatShortBillId(entry.bill_type, entry.bill_number)
  const page = await fetchFeed({ limit: 15, offset: 0, q })
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
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [digest, setDigest] = useState<DigestPhase>({ kind: 'idle' })
  const requestIdRef = useRef(0)

  const { rootRef, panelRef, isClosing, getIsClosing, requestClose } = useAnimatedDismiss({
    onDismissed: onClose,
    exitAnimationName: EXIT_ANIMATION_NAME,
    fallbackMs: EXIT_ANIMATION_FALLBACK_MS,
    cancelKey: selectionKey,
    restoreFocusRef: closeRef,
  })

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

  useEffect(() => {
    if (!open) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    returnFocusRef.current = previouslyFocused

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current || getIsClosing()) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      returnFocusRef.current?.focus()
      returnFocusRef.current = null
    }
  }, [open, requestClose, getIsClosing])

  if (!open || !entry) return null

  const title = billTitle(entry)
  const billId = formatShortBillId(entry.bill_type, entry.bill_number)
  const sourceUrl = congressGovBillUrl(entry.congress, entry.bill_type, entry.bill_number)
  const summary = digest.kind === 'ready' ? getFeedSummaryContent(digest.item) : null

  return (
    <div
      ref={rootRef}
      className={`member-profile-root${isClosing ? ' member-profile-root--closing' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="member-profile-backdrop"
        aria-label="Close bill details"
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        className="member-profile-panel notable-bill-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="member-profile-toolbar">
          <button
            ref={closeRef}
            type="button"
            className="member-profile-close"
            onClick={requestClose}
          >
            Close
          </button>
        </div>

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
          {entry.defectors.length > 0 ? (
            <ul className="notable-vote-defectors">
              {entry.defectors.map((defector) => (
                <li key={defector.bioguide_id} className="notable-vote-defector">
                  <button
                    type="button"
                    className="notable-vote-defector-button"
                    onClick={() => onOpenProfile(defector)}
                    onMouseEnter={() => prefetchMemberProfile(defector.bioguide_id)}
                    onFocus={() => prefetchMemberProfile(defector.bioguide_id)}
                    aria-label={`Open profile for ${defector.name}`}
                  >
                    <MemberAvatar
                      name={defector.name}
                      photoUrl={defector.photo_url}
                      variant="defector"
                    />
                    <span className="notable-vote-defector-copy">
                      <span className="notable-vote-defector-name">{defector.name}</span>
                      <span
                        className={`notable-vote-defector-party ${partyCssClass(defector.party)}`}
                      >
                        {partyShortLabel(defector.party)}-{defector.state}
                      </span>
                      <span className="notable-vote-defector-hint">
                        {crossVoteHint(defector.cross_vote_label)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : entry.member_votes_available === false ? (
            <p className="member-profile-muted">{MEMBER_VOTES_UNAVAILABLE}</p>
          ) : (
            <p className="member-profile-muted">{noPartyDefectorsMessage(entry.chamber)}</p>
          )}
        </section>

        <a
          className="member-profile-link congress-link"
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Read on congress.gov ↗
        </a>
      </div>
    </div>
  )
}

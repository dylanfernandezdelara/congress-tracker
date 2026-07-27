import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { prefetchMemberProfile } from '../api/memberProfileCache'
import type { NotableVoteEntry } from '../api/types'
import { formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { notableVoteTitle } from '../utils/notableVoteLabels'
import { MemberProfile, type MemberProfileSeed } from './MemberProfile'
import { NotableBillSheet } from './NotableBillSheet'
import { NotableVoteDefectors } from './NotableVoteDefectors'

type NotableVotesSectionProps = {
  notable: NotableVoteEntry[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  /** `cards` = full notable cards (default). `compact` = dense rail list. */
  variant?: 'cards' | 'compact'
}

type BillOverlay = { entry: NotableVoteEntry; key: number }
type MemberOverlay = { seed: MemberProfileSeed; key: number }

type OverlayState = {
  bill: BillOverlay | null
  member: MemberOverlay | null
}

function NotableVoteHeadline({
  title,
  onOpen,
  headingClassName,
  as = 'h3',
}: {
  title: string
  onOpen: () => void
  headingClassName: string
  as?: 'h3' | 'p'
}) {
  const HeadingTag = as

  // Keep the heading element outside the button (valid content model).
  return (
    <HeadingTag className={headingClassName}>
      <button
        type="button"
        className="notable-headline-button"
        onClick={onOpen}
        aria-label={`Open bill details for ${title}`}
      >
        {title}
      </button>
    </HeadingTag>
  )
}

function NotableVoteMeta({
  entry,
  className,
  trailing,
}: {
  entry: NotableVoteEntry
  className: string
  trailing?: ReactNode
}) {
  const shortBillId = formatShortBillId(entry.bill_type, entry.bill_number)
  return (
    <p className={className}>
      {entry.chamber} · {formatVoteDate(entry.vote_date)} · {shortBillId}
      {trailing}
    </p>
  )
}

function NotableVoteCard({
  entry,
  onOpenProfile,
  onOpenBill,
}: {
  entry: NotableVoteEntry
  onOpenProfile: (seed: MemberProfileSeed) => void
  onOpenBill: (entry: NotableVoteEntry) => void
}) {
  const title = notableVoteTitle(entry)

  return (
    <article className="notable-vote-card">
      <NotableVoteHeadline
        title={title}
        headingClassName="notable-vote-title"
        onOpen={() => onOpenBill(entry)}
      />
      <p className="notable-vote-why">{entry.why_it_matters}</p>
      <NotableVoteMeta entry={entry} className="notable-vote-meta" />
      <NotableVoteDefectors entry={entry} onOpenProfile={onOpenProfile} />
    </article>
  )
}

function NotableVoteCompactItem({
  entry,
  onOpenProfile,
  onOpenBill,
}: {
  entry: NotableVoteEntry
  onOpenProfile: (seed: MemberProfileSeed) => void
  onOpenBill: (entry: NotableVoteEntry) => void
}) {
  const title = notableVoteTitle(entry)
  const firstDefector = entry.defectors[0]

  return (
    <li className="notable-compact-item">
      <NotableVoteHeadline
        as="p"
        title={title}
        headingClassName="notable-compact-headline"
        onOpen={() => onOpenBill(entry)}
      />
      <NotableVoteMeta
        entry={entry}
        className="notable-compact-meta"
        trailing={entry.why_it_matters ? ` · ${entry.why_it_matters}` : null}
      />
      {firstDefector ? (
        <button
          type="button"
          className="notable-compact-member"
          onClick={() => onOpenProfile(firstDefector)}
          onMouseEnter={() => prefetchMemberProfile(firstDefector.bioguide_id)}
          onFocus={() => prefetchMemberProfile(firstDefector.bioguide_id)}
          aria-label={`Open profile for ${firstDefector.name}`}
        >
          {firstDefector.name}
          {entry.defectors.length > 1 ? ` +${entry.defectors.length - 1}` : ''}
        </button>
      ) : null}
    </li>
  )
}

function nextOverlayKey(state: OverlayState): number {
  return Math.max(state.bill?.key ?? 0, state.member?.key ?? 0) + 1
}

export function NotableVotesSection({
  notable,
  loading = false,
  error = null,
  onRetry,
  variant = 'cards',
}: NotableVotesSectionProps) {
  const [overlays, setOverlays] = useState<OverlayState>({ bill: null, member: null })

  useEffect(() => {
    if (!notable) return
    for (const entry of notable) {
      for (const defector of entry.defectors) {
        prefetchMemberProfile(defector.bioguide_id)
      }
    }
  }, [notable])

  /* Profile stacks on top of an open bill sheet (Escape returns to the bill). */
  const openProfile = useCallback((seed: MemberProfileSeed) => {
    setOverlays((prev) => ({
      ...prev,
      member: { seed, key: nextOverlayKey(prev) },
    }))
  }, [])

  const openBill = useCallback((entry: NotableVoteEntry) => {
    setOverlays((prev) => ({
      ...prev,
      bill: { entry, key: nextOverlayKey(prev) },
    }))
  }, [])

  const closeBill = useCallback(() => {
    setOverlays((prev) => ({ ...prev, bill: null }))
  }, [])

  const closeMember = useCallback(() => {
    setOverlays((prev) => ({ ...prev, member: null }))
  }, [])

  const overlayNodes = (
    <>
      {overlays.bill ? (
        <NotableBillSheet
          open
          entry={overlays.bill.entry}
          selectionKey={overlays.bill.key}
          onClose={closeBill}
          onOpenProfile={openProfile}
        />
      ) : null}
      {overlays.member ? (
        <MemberProfile
          open
          seed={overlays.member.seed}
          selectionKey={overlays.member.key}
          onClose={closeMember}
        />
      ) : null}
    </>
  )

  if (error) {
    const className = variant === 'compact' ? 'notable-compact' : 'home-enrichment'
    return (
      <section className={className} aria-label="Notable votes">
        <p className="text-[13px] text-secondary">{error}</p>
        {onRetry ? (
          <button type="button" className="ghost-button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {overlayNodes}
      </section>
    )
  }

  if (loading && !notable) {
    if (variant === 'compact') {
      return (
        <section className="notable-compact" aria-label="Notable votes">
          <p className="text-[12px] text-faint">Loading notable votes…</p>
          {overlayNodes}
        </section>
      )
    }
    return (
      <section className="home-enrichment" aria-label="Notable votes">
        <div className="notable-votes-skeleton" aria-hidden="true" />
        {overlayNodes}
      </section>
    )
  }

  if (!notable || notable.length === 0) {
    if (variant === 'compact') {
      return (
        <section className="notable-compact" aria-label="Notable votes">
          <h2 className="notable-compact-title">Notable votes</h2>
          <p className="notable-votes-empty">No notable votes yet this session.</p>
          {overlayNodes}
        </section>
      )
    }

    return (
      <section className="home-enrichment" aria-label="Notable votes">
        <div className="home-enrichment-header">
          <h2 className="home-enrichment-title">Notable votes</h2>
        </div>
        <p className="notable-votes-empty">No notable votes yet this session.</p>
        {overlayNodes}
      </section>
    )
  }

  if (variant === 'compact') {
    return (
      <section className="notable-compact" aria-label="Notable votes">
        <h2 className="notable-compact-title">Notable votes</h2>
        <ul className="notable-compact-list">
          {notable.map((entry) => (
            <NotableVoteCompactItem
              key={`${entry.chamber}-${entry.congress}-${entry.session}-${entry.roll_number}`}
              entry={entry}
              onOpenProfile={openProfile}
              onOpenBill={openBill}
            />
          ))}
        </ul>
        {overlayNodes}
      </section>
    )
  }

  return (
    <section className="home-enrichment" aria-label="Notable votes">
      <div className="home-enrichment-header">
        <h2 className="home-enrichment-title">Notable votes</h2>
      </div>
      <div className="notable-votes-list">
        {notable.map((entry) => (
          <NotableVoteCard
            key={`${entry.chamber}-${entry.congress}-${entry.session}-${entry.roll_number}`}
            entry={entry}
            onOpenProfile={openProfile}
            onOpenBill={openBill}
          />
        ))}
      </div>
      {overlayNodes}
    </section>
  )
}

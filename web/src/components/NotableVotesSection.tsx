import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { prefetchMemberProfile } from '../api/memberProfileCache'
import type { NotableVoteEntry, StatsChamber } from '../api/types'
import { partyCssClass, partyShortLabel } from '@congress-tracker/shared/party'
import { crossVoteHint } from '@congress-tracker/shared/notable-votes'
import {
  MEMBER_VOTES_UNAVAILABLE,
  noPartyDefectorsMessage,
} from '../constants/memberVotesCopy'
import { formatBillDocket, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import { MemberAvatar } from './MemberAvatar'
import { MemberProfile, type MemberProfileSeed } from './MemberProfile'

/** Bill identity passed to the feed deep-link opener. */
export type NotableBillRef = {
  congress: number
  type: string
  number: number
  chamber?: StatsChamber
}

type NotableVotesSectionProps = {
  notable: NotableVoteEntry[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  /** Open the bill in the main feed (deep-link expand). */
  onOpenBill?: (bill: NotableBillRef) => void
  /** `cards` = full notable cards (default). `compact` = dense rail list. */
  variant?: 'cards' | 'compact'
}

function billRefFromEntry(entry: NotableVoteEntry): NotableBillRef {
  return {
    congress: entry.congress,
    type: entry.bill_type,
    number: entry.bill_number,
    chamber: entry.chamber,
  }
}

function NotableVoteHeadline({
  title,
  onOpen,
  headingClassName,
  as = 'h3',
}: {
  title: string
  onOpen?: () => void
  headingClassName: string
  as?: 'h3' | 'p'
}) {
  const HeadingTag = as

  if (!onOpen) {
    return <HeadingTag className={headingClassName}>{title}</HeadingTag>
  }

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

function NotableVoteDefectors({
  entry,
  onOpenProfile,
}: {
  entry: NotableVoteEntry
  onOpenProfile: (seed: MemberProfileSeed) => void
}) {
  if (entry.defectors.length > 0) {
    return (
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
                <span className={`notable-vote-defector-party ${partyCssClass(defector.party)}`}>
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
    )
  }

  if (entry.member_votes_available === false) {
    return <p className="notable-vote-defectors-empty">{MEMBER_VOTES_UNAVAILABLE}</p>
  }

  return (
    <p className="notable-vote-defectors-empty">{noPartyDefectorsMessage(entry.chamber)}</p>
  )
}

function NotableVoteMeta({
  entry,
  showBillId,
  className,
  trailing,
}: {
  entry: NotableVoteEntry
  showBillId: boolean
  className: string
  trailing?: ReactNode
}) {
  const shortBillId = formatShortBillId(entry.bill_type, entry.bill_number)
  return (
    <p className={className}>
      {entry.chamber} · {formatVoteDate(entry.vote_date)}
      {showBillId ? ` · ${shortBillId}` : ''}
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
  onOpenBill?: (bill: NotableBillRef) => void
}) {
  const billLabel = formatBillDocket(entry.bill_type, entry.bill_number, entry.congress)
  const title = entry.headline ?? `${billLabel} passage vote`

  return (
    <article className="notable-vote-card">
      <NotableVoteHeadline
        title={title}
        headingClassName="notable-vote-title"
        onOpen={onOpenBill ? () => onOpenBill(billRefFromEntry(entry)) : undefined}
      />
      <p className="notable-vote-why">{entry.why_it_matters}</p>
      <NotableVoteMeta entry={entry} showBillId={Boolean(onOpenBill)} className="notable-vote-meta" />
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
  onOpenBill?: (bill: NotableBillRef) => void
}) {
  const title = entry.headline ?? `${entry.chamber} passage vote`
  const firstDefector = entry.defectors[0]

  return (
    <li className="notable-compact-item">
      <NotableVoteHeadline
        as="p"
        title={title}
        headingClassName="notable-compact-headline"
        onOpen={onOpenBill ? () => onOpenBill(billRefFromEntry(entry)) : undefined}
      />
      <NotableVoteMeta
        entry={entry}
        showBillId={Boolean(onOpenBill)}
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

export function NotableVotesSection({
  notable,
  loading = false,
  error = null,
  onRetry,
  onOpenBill,
  variant = 'cards',
}: NotableVotesSectionProps) {
  const [selection, setSelection] = useState<{ seed: MemberProfileSeed; key: number } | null>(
    null,
  )

  useEffect(() => {
    if (!notable) return
    for (const entry of notable) {
      for (const defector of entry.defectors) {
        prefetchMemberProfile(defector.bioguide_id)
      }
    }
  }, [notable])

  const openProfile = useCallback((seed: MemberProfileSeed) => {
    setSelection((prev) => ({ seed, key: (prev?.key ?? 0) + 1 }))
  }, [])

  const profile = (
    <MemberProfile
      open={selection !== null}
      seed={selection?.seed ?? null}
      selectionKey={selection?.key ?? 0}
      onClose={() => setSelection(null)}
    />
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
      </section>
    )
  }

  if (loading && !notable) {
    if (variant === 'compact') {
      return (
        <section className="notable-compact" aria-label="Notable votes">
          <p className="text-[12px] text-faint">Loading notable votes…</p>
        </section>
      )
    }
    return (
      <section className="home-enrichment" aria-label="Notable votes">
        <div className="notable-votes-skeleton" aria-hidden="true" />
      </section>
    )
  }

  if (!notable || notable.length === 0) {
    if (variant === 'compact') {
      return (
        <section className="notable-compact" aria-label="Notable votes">
          <h2 className="notable-compact-title">Notable votes</h2>
          <p className="notable-votes-empty">No notable votes yet this session.</p>
        </section>
      )
    }

    return (
      <section className="home-enrichment" aria-label="Notable votes">
        <div className="home-enrichment-header">
          <h2 className="home-enrichment-title">Notable votes</h2>
        </div>
        <p className="notable-votes-empty">No notable votes yet this session.</p>
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
              onOpenBill={onOpenBill}
            />
          ))}
        </ul>
        {profile}
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
            onOpenBill={onOpenBill}
          />
        ))}
      </div>
      {profile}
    </section>
  )
}

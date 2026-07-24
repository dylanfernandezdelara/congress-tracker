import { useCallback, useEffect, useState } from 'react'

import { prefetchMemberProfile } from '../api/memberProfileCache'
import type { NotableVoteEntry } from '../api/types'
import { partyCssClass, partyShortLabel } from '@congress-tracker/shared/party'
import { crossVoteHint } from '@congress-tracker/shared/notable-votes'
import {
  MEMBER_VOTES_UNAVAILABLE,
  noPartyDefectorsMessage,
} from '../constants/memberVotesCopy'
import { formatBillDocket, formatVoteDate } from '../utils/billLabels'
import { MemberAvatar } from './MemberAvatar'
import { MemberProfile, type MemberProfileSeed } from './MemberProfile'

type NotableVotesSectionProps = {
  notable: NotableVoteEntry[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  /** `cards` = full notable cards (default). `compact` = dense rail list. */
  variant?: 'cards' | 'compact'
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

function NotableVoteCard({
  entry,
  onOpenProfile,
}: {
  entry: NotableVoteEntry
  onOpenProfile: (seed: MemberProfileSeed) => void
}) {
  const billLabel = formatBillDocket(entry.bill_type, entry.bill_number, entry.congress)
  const title = entry.headline ?? `${billLabel} passage vote`

  return (
    <article className="notable-vote-card">
      <h3 className="notable-vote-title">{title}</h3>
      <p className="notable-vote-why">{entry.why_it_matters}</p>
      <p className="notable-vote-meta">
        {entry.chamber} · {formatVoteDate(entry.vote_date)}
      </p>
      <NotableVoteDefectors entry={entry} onOpenProfile={onOpenProfile} />
    </article>
  )
}

function NotableVoteCompactItem({
  entry,
  onOpenProfile,
}: {
  entry: NotableVoteEntry
  onOpenProfile: (seed: MemberProfileSeed) => void
}) {
  const title = entry.headline ?? `${entry.chamber} passage vote`
  const firstDefector = entry.defectors[0]

  return (
    <li className="notable-compact-item">
      <p className="notable-compact-headline">{title}</p>
      <p className="notable-compact-meta">
        {entry.chamber} · {formatVoteDate(entry.vote_date)}
        {entry.why_it_matters ? ` · ${entry.why_it_matters}` : ''}
      </p>
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
          />
        ))}
      </div>
      {profile}
    </section>
  )
}

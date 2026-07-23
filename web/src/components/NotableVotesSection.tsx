import { useCallback, useState } from 'react'

import type { NotableVoteEntry } from '../api/types'
import { partyCssClass, partyShortLabel } from '@congress-tracker/shared/party'
import { crossVoteHint } from '@congress-tracker/shared/notable-votes'
import {
  MEMBER_VOTES_UNAVAILABLE,
  noPartyDefectorsMessage,
} from '../constants/memberVotesCopy'
import { formatBillDocket, formatVoteDate } from '../utils/billLabels'
import { memberInitials } from '../utils/memberPhoto'
import { MemberProfile, type MemberProfileSeed } from './MemberProfile'

type NotableVotesSectionProps = {
  notable: NotableVoteEntry[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

function DefectorAvatar({
  name,
  photoUrl,
}: {
  name: string
  photoUrl: string
}) {
  const [failed, setFailed] = useState(false)
  const showPhoto = photoUrl && !failed

  return (
    <span className="notable-defector-avatar" aria-hidden="true">
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="notable-defector-avatar-fallback">{memberInitials(name)}</span>
      )}
    </span>
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
              aria-label={`Open profile for ${defector.name}`}
            >
              <DefectorAvatar name={defector.name} photoUrl={defector.photo_url} />
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

export function NotableVotesSection({
  notable,
  loading = false,
  error = null,
  onRetry,
}: NotableVotesSectionProps) {
  const [profileSeed, setProfileSeed] = useState<MemberProfileSeed | null>(null)

  /* Clone the seed so every selection produces a fresh object identity;
     MemberProfile relies on this to cancel a pending animated close when the
     same member is re-selected mid-exit-animation. */
  const openProfile = useCallback((seed: MemberProfileSeed) => {
    setProfileSeed({ ...seed })
  }, [])

  if (error) {
    return (
      <section className="home-enrichment" aria-label="Notable votes">
        <p className="home-enrichment-error text-sm text-secondary">{error}</p>
        {onRetry ? (
          <button type="button" className="ghost-button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </section>
    )
  }

  if (loading && !notable) {
    return (
      <section className="home-enrichment" aria-label="Notable votes">
        <div className="notable-votes-skeleton" aria-hidden="true" />
      </section>
    )
  }

  if (!notable || notable.length === 0) return null

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
      <MemberProfile
        open={profileSeed !== null}
        seed={profileSeed}
        onClose={() => setProfileSeed(null)}
      />
    </section>
  )
}

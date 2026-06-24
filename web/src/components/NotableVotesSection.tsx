import { useState } from 'react'

import type { NotableVoteEntry } from '../api/types'
import { partyCssClass, partyShortLabel } from '@congress-tracker/shared/party'
import { formatBillDocket, formatVoteDate } from '../utils/billLabels'
import { memberInitials } from '../utils/memberPhoto'

type NotableVotesSectionProps = {
  notable: NotableVoteEntry[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

function crossVoteHint(label: NotableVoteEntry['defectors'][number]['cross_vote_label']): string {
  switch (label) {
    case 'rare':
      return 'Rare party-line break'
    case 'occasional':
      return 'Occasional cross-voter'
    case 'frequent':
      return 'Frequent cross-voter'
    default: {
      const _exhaustive: never = label
      return _exhaustive
    }
  }
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

function NotableVoteDefectors({ entry }: { entry: NotableVoteEntry }) {
  if (entry.defectors.length > 0) {
    return (
      <ul className="notable-vote-defectors">
        {entry.defectors.map((defector) => (
          <li key={defector.bioguide_id} className="notable-vote-defector">
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
          </li>
        ))}
      </ul>
    )
  }

  if (entry.member_votes_available === false) {
    return (
      <p className="notable-vote-defectors-empty">
        Per-member vote breakdown is not available for this roll call yet.
      </p>
    )
  }

  return (
    <p className="notable-vote-defectors-empty">
      No members broke with their party on this {entry.chamber} vote.
    </p>
  )
}

function NotableVoteCard({ entry }: { entry: NotableVoteEntry }) {
  const billLabel = formatBillDocket(entry.bill_type, entry.bill_number, entry.congress)
  const title = entry.headline ?? `${billLabel} passage vote`

  return (
    <article className="notable-vote-card">
      <h3 className="notable-vote-title">{title}</h3>
      <p className="notable-vote-why">{entry.why_it_matters}</p>
      <p className="notable-vote-meta">
        {entry.chamber} · {formatVoteDate(entry.vote_date)}
      </p>
      <NotableVoteDefectors entry={entry} />
    </article>
  )
}

export function NotableVotesSection({
  notable,
  loading = false,
  error = null,
  onRetry,
}: NotableVotesSectionProps) {
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
          />
        ))}
      </div>
    </section>
  )
}

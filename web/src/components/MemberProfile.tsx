import { useEffect, useId, useRef, useState } from 'react'

import { fetchMemberProfile } from '../api/client'
import type { MemberProfileResponse, NotableVoteEntry } from '../api/types'
import { partyCssClass, partyDisplayName, partyShortLabel } from '@congress-tracker/shared/party'
import { crossVoteHint } from '@congress-tracker/shared/notable-votes'
import { formatBillDocket, formatVoteDate } from '../utils/billLabels'
import { memberInitials } from '../utils/memberPhoto'
import { useAsyncData } from '../hooks/useAsyncData'

export type MemberProfileSeed = Pick<
  NotableVoteEntry['defectors'][number],
  'bioguide_id' | 'name' | 'party' | 'state' | 'photo_url' | 'cross_vote_count' | 'cross_vote_label'
>

type MemberProfileProps = {
  open: boolean
  seed: MemberProfileSeed | null
  onClose: () => void
}

function ProfileAvatar({ name, photoUrl }: { name: string; photoUrl: string }) {
  const [failed, setFailed] = useState(false)
  const showPhoto = Boolean(photoUrl) && !failed

  return (
    <span className="member-profile-avatar" aria-hidden="true">
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="member-profile-avatar-fallback">{memberInitials(name)}</span>
      )}
    </span>
  )
}

function seatLabel(profile: Pick<MemberProfileResponse, 'chamber' | 'state' | 'district'>): string {
  if (profile.chamber === 'Senate') return `Senator from ${profile.state}`
  if (profile.district != null) return `${profile.state}-${profile.district}`
  return `Representative from ${profile.state}`
}

function positionWord(position: 'yea' | 'nay'): string {
  return position === 'yea' ? 'Yea' : 'Nay'
}

export function MemberProfile({ open, seed, onClose }: MemberProfileProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const bioguideId = seed?.bioguide_id ?? null

  const enabled = open && Boolean(bioguideId)
  const {
    data: profile,
    error: loadError,
    isLoading,
  } = useAsyncData({
    deps: [enabled, bioguideId],
    validate: () => (enabled ? null : 'disabled'),
    load: () => fetchMemberProfile(bioguideId!),
    mapError: (err) => (err instanceof Error ? err.message : 'Could not load member profile'),
  })
  const error = enabled && loadError && loadError !== 'disabled' ? loadError : null

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return
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
    }
  }, [open, onClose])

  if (!open || !seed) return null

  const name = profile?.name ?? seed.name
  const party = profile?.party ?? seed.party
  const state = profile?.state ?? seed.state
  const photoUrl = profile?.photo_url || seed.photo_url
  const crossVoteLabelValue = profile?.cross_vote_label ?? seed.cross_vote_label
  const congressGovUrl = profile?.congress_gov_url ?? null
  const hint = crossVoteHint(crossVoteLabelValue)

  let seatText = `${partyShortLabel(party)}-${state}`
  if (profile) seatText = seatLabel(profile)
  else if (isLoading) seatText = `${state} · loading seat details…`

  return (
    <div className="member-profile-root" role="presentation">
      <button
        type="button"
        className="member-profile-backdrop"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="member-profile-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="member-profile-toolbar">
          <button
            ref={closeRef}
            type="button"
            className="member-profile-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="member-profile-header">
          <ProfileAvatar name={name} photoUrl={photoUrl} />
          <div className="member-profile-identity">
            <h2 id={titleId} className="member-profile-name">
              {name}
            </h2>
            <p className={`member-profile-party ${partyCssClass(party)}`}>
              {partyDisplayName(party)} · {partyShortLabel(party)}-{state}
            </p>
            <p className="member-profile-seat">{seatText}</p>
          </div>
        </div>

        <section className="member-profile-section" aria-label="Voting behavior">
          <h3 className="member-profile-section-title">Voting behavior</h3>
          <p className="member-profile-behavior">{hint}</p>
          {profile?.member_votes_available ? (
            <dl className="member-profile-stats">
              <div>
                <dt>Passage votes</dt>
                <dd>{profile.votes_cast}</dd>
              </div>
              <div>
                <dt>Yea / Nay</dt>
                <dd>
                  {profile.yea_count} / {profile.nay_count}
                </dd>
              </div>
              <div>
                <dt>Party-line breaks</dt>
                <dd>{profile.cross_vote_count}</dd>
              </div>
            </dl>
          ) : isLoading && !profile ? (
            <p className="member-profile-muted">Loading session voting stats…</p>
          ) : error && !profile ? (
            <p className="member-profile-muted">{error}</p>
          ) : (
            <p className="member-profile-muted">
              Per-member vote history is not available for this session yet.
            </p>
          )}
        </section>

        {profile && profile.recent_cross_votes.length > 0 ? (
          <section className="member-profile-section" aria-label="Recent party-line breaks">
            <h3 className="member-profile-section-title">Recent party-line breaks</h3>
            <ul className="member-profile-recent">
              {profile.recent_cross_votes.map((vote) => (
                <li
                  key={`${vote.chamber}-${vote.congress}-${vote.session}-${vote.roll_number}`}
                  className="member-profile-recent-item"
                >
                  <span className="member-profile-recent-bill">
                    {formatBillDocket(vote.bill_type, vote.bill_number, vote.bill_congress)}
                  </span>
                  <span className="member-profile-recent-meta">
                    {vote.chamber} · {formatVoteDate(vote.vote_date)} · voted{' '}
                    {positionWord(vote.position)} (party {positionWord(vote.party_line)})
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {congressGovUrl ? (
          <a
            className="member-profile-link congress-link"
            href={congressGovUrl}
            target="_blank"
            rel="noreferrer"
          >
            View on Congress.gov
          </a>
        ) : null}
      </div>
    </div>
  )
}

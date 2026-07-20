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

type StatsPhase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable' }
  | { kind: 'ready'; profile: MemberProfileResponse }

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

function statsPhase(
  profile: MemberProfileResponse | null,
  isLoading: boolean,
  error: string | null,
): StatsPhase {
  if (profile?.member_votes_available) return { kind: 'ready', profile }
  if (isLoading && !profile) return { kind: 'loading' }
  if (error && !profile) return { kind: 'error', message: error }
  return { kind: 'unavailable' }
}

export function MemberProfile({ open, seed, onClose }: MemberProfileProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const bioguideId = open ? seed?.bioguide_id ?? null : null

  const {
    data: profile,
    error,
    isLoading,
  } = useAsyncData({
    deps: [bioguideId],
    enabled: Boolean(bioguideId),
    load: () => fetchMemberProfile(bioguideId as string),
    mapError: (err) => (err instanceof Error ? err.message : 'Could not load member profile'),
  })

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
      returnFocusRef.current?.focus()
      returnFocusRef.current = null
    }
  }, [open, onClose])

  if (!open || !seed) return null

  const name = profile?.name ?? seed.name
  const party = profile?.party ?? seed.party
  const state = profile?.state ?? seed.state
  const photoUrl = profile?.photo_url || seed.photo_url
  const hint = crossVoteHint(profile?.cross_vote_label ?? seed.cross_vote_label)
  const phase = statsPhase(profile, isLoading, error)

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
            {profile ? <p className="member-profile-seat">{seatLabel(profile)}</p> : null}
          </div>
        </div>

        <section className="member-profile-section" aria-label="Voting behavior">
          <h3 className="member-profile-section-title">Voting behavior</h3>
          <p className="member-profile-behavior">{hint}</p>
          {phase.kind === 'ready' ? (
            <dl className="member-profile-stats">
              <div>
                <dt>Passage votes</dt>
                <dd>{phase.profile.votes_cast}</dd>
              </div>
              <div>
                <dt>Yea / Nay</dt>
                <dd>
                  {phase.profile.yea_count} / {phase.profile.nay_count}
                </dd>
              </div>
              <div>
                <dt>Party-line breaks</dt>
                <dd>{phase.profile.cross_vote_count}</dd>
              </div>
            </dl>
          ) : null}
          {phase.kind === 'loading' ? (
            <p className="member-profile-muted">Loading session voting stats…</p>
          ) : null}
          {phase.kind === 'error' ? (
            <p className="member-profile-muted">{phase.message}</p>
          ) : null}
          {phase.kind === 'unavailable' ? (
            <p className="member-profile-muted">
              Per-member vote history is not available for this session yet.
            </p>
          ) : null}
        </section>

        {phase.kind === 'ready' && phase.profile.recent_cross_votes.length > 0 ? (
          <section className="member-profile-section" aria-label="Recent party-line breaks">
            <h3 className="member-profile-section-title">Recent party-line breaks</h3>
            <ul className="member-profile-recent">
              {phase.profile.recent_cross_votes.map((vote) => (
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

        {profile?.congress_gov_url ? (
          <a
            className="member-profile-link congress-link"
            href={profile.congress_gov_url}
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

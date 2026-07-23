import { useCallback, useEffect, useId, useRef, useState } from 'react'

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

/* Safety net in case animationend never fires (e.g. animations disabled by the
   browser); slightly longer than the longest exit animation in profile.css. */
const EXIT_ANIMATION_FALLBACK_MS = 400

/* Exit animation names defined in profile.css; the enter animations must not
   finish the close, so animationend events are filtered against this set. */
const EXIT_ANIMATION_NAMES = new Set(['member-profile-sink', 'member-profile-sink-desktop'])

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
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const bioguideId = open ? seed?.bioguide_id ?? null : null

  const [isClosing, setIsClosing] = useState(false)
  const isClosingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const finishClose = useCallback(() => {
    if (!isClosingRef.current) return
    isClosingRef.current = false
    setIsClosing(false)
    onCloseRef.current()
  }, [])

  const requestClose = useCallback(() => {
    if (isClosingRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onCloseRef.current()
      return
    }
    isClosingRef.current = true
    setIsClosing(true)
  }, [])

  /* If a profile is selected while the exit animation is running, cancel the
     close so the dialog animates back in with the selected member instead of
     the pending onClose() silently discarding the selection. Compared by seed
     object identity (the parent creates a fresh seed object per selection) so
     re-selecting the same member mid-close also cancels the close. */
  const prevSeedRef = useRef(seed)
  useEffect(() => {
    if (prevSeedRef.current === seed) return
    prevSeedRef.current = seed
    if (seed !== null && isClosingRef.current) {
      isClosingRef.current = false
      setIsClosing(false)
    }
  }, [seed])

  useEffect(() => {
    if (!isClosing) return
    /* React 18 has no `inert` prop support, so toggle the attribute directly.
       While the exit animation runs, the departing dialog must be unfocusable
       and hidden from assistive tech (pointer-events is handled in CSS). */
    const root = rootRef.current
    root?.setAttribute('inert', '')
    const panel = panelRef.current
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.target === panel && EXIT_ANIMATION_NAMES.has(event.animationName)) finishClose()
    }
    panel?.addEventListener('animationend', handleAnimationEnd)
    const timer = window.setTimeout(finishClose, EXIT_ANIMATION_FALLBACK_MS)
    return () => {
      root?.removeAttribute('inert')
      panel?.removeEventListener('animationend', handleAnimationEnd)
      window.clearTimeout(timer)
    }
  }, [isClosing, finishClose])

  /* When a selection cancels a pending close, focus is still on the background
     button that was clicked (the inert root blurred the dialog); pull it back
     into the still-open modal. Declared after the inert effect so its cleanup
     has already removed the inert attribute when this runs. Skipped on the
     finish path because open flips false in the same commit. */
  const wasClosingRef = useRef(false)
  useEffect(() => {
    const wasClosing = wasClosingRef.current
    wasClosingRef.current = isClosing
    if (wasClosing && !isClosing && open) closeRef.current?.focus()
  }, [isClosing, open])

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
        requestClose()
        return
      }

      /* Skip the focus trap while the exit animation runs: the root is inert,
         so Tab should move focus out of the departing dialog, not cycle it. */
      if (event.key !== 'Tab' || !panelRef.current || isClosingRef.current) return
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
  }, [open, requestClose])

  if (!open || !seed) return null

  /* useAsyncData keeps prior data while refetching; ignore it when it belongs
     to a different member than the current seed (e.g. reopening mid-close). */
  const seedProfile = profile?.bioguide_id === seed.bioguide_id ? profile : null
  const name = seedProfile?.name ?? seed.name
  const party = seedProfile?.party ?? seed.party
  const state = seedProfile?.state ?? seed.state
  const photoUrl = seedProfile?.photo_url || seed.photo_url
  const hint = crossVoteHint(seedProfile?.cross_vote_label ?? seed.cross_vote_label)
  /* A mismatched cached profile means the fetch for this seed has not landed
     yet; show loading rather than flashing "unavailable" for one render. */
  const isSeedLoading = isLoading || (profile !== null && seedProfile === null)
  const phase = statsPhase(seedProfile, isSeedLoading, error)

  return (
    <div
      ref={rootRef}
      className={`member-profile-root${isClosing ? ' member-profile-root--closing' : ''}`}
      role="presentation"
    >
      <button
        type="button"
        className="member-profile-backdrop"
        aria-label="Close profile"
        onClick={requestClose}
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
            onClick={requestClose}
          >
            Close
          </button>
        </div>

        <div className="member-profile-header">
          <ProfileAvatar key={seed.bioguide_id} name={name} photoUrl={photoUrl} />
          <div className="member-profile-identity">
            <h2 id={titleId} className="member-profile-name">
              {name}
            </h2>
            <p className={`member-profile-party ${partyCssClass(party)}`}>
              {partyDisplayName(party)} · {partyShortLabel(party)}-{state}
            </p>
            {seedProfile ? <p className="member-profile-seat">{seatLabel(seedProfile)}</p> : null}
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

        {seedProfile?.congress_gov_url ? (
          <a
            className="member-profile-link congress-link"
            href={seedProfile.congress_gov_url}
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

import { useEffect, useId, useRef, useState } from 'react'

import { getCachedMemberProfile, loadMemberProfile } from '../api/memberProfileCache'
import type { MemberProfileResponse, NotableVoteEntry } from '../api/types'
import { partyCssClass, partyDisplayName, partyShortLabel } from '@congress-tracker/shared/party'
import { crossVoteHint } from '@congress-tracker/shared/notable-votes'
import { formatBillDocket, formatVoteDate } from '../utils/billLabels'
import { memberInitials } from '../utils/memberPhoto'
import { useAnimatedDismiss } from '../hooks/useAnimatedDismiss'
import { useAsyncData } from '../hooks/useAsyncData'

export type MemberProfileSeed = Pick<
  NotableVoteEntry['defectors'][number],
  'bioguide_id' | 'name' | 'party' | 'state' | 'photo_url' | 'cross_vote_count' | 'cross_vote_label'
>

type MemberProfileProps = {
  open: boolean
  seed: MemberProfileSeed | null
  /* Bumped by the parent on every selection (including re-selecting the same
     member); a change cancels a pending animated close so the dialog stays
     open for the new selection instead of dismissing it. */
  selectionKey?: number
  /* Fires after the exit animation completes (immediately under reduced
     motion); the parent should unmount/clear the seed in response. */
  onClose: () => void
}

/* Safety net in case animationend never fires (e.g. animations disabled by the
   browser); slightly longer than the exit animation in profile.css. */
const EXIT_ANIMATION_FALLBACK_MS = 400

/* Exit animation name defined in profile.css (shared across breakpoints; the
   desktop slide distance is a CSS custom property, not a separate keyframe). */
const EXIT_ANIMATION_NAME = 'member-profile-sink'

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

export function MemberProfile({ open, seed, selectionKey = 0, onClose }: MemberProfileProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const bioguideId = open ? seed?.bioguide_id ?? null : null

  const { rootRef, panelRef, isClosing, isClosingRef, requestClose, cancelClose } =
    useAnimatedDismiss({
      onDismissed: onClose,
      exitAnimationName: EXIT_ANIMATION_NAME,
      fallbackMs: EXIT_ANIMATION_FALLBACK_MS,
    })

  /* A new selection while the exit animation is running cancels the close so
     the dialog animates back in with the new selection instead of the pending
     onClose() silently discarding it. */
  const prevSelectionKeyRef = useRef(selectionKey)
  useEffect(() => {
    if (prevSelectionKeyRef.current === selectionKey) return
    prevSelectionKeyRef.current = selectionKey
    cancelClose()
  }, [selectionKey, cancelClose])

  /* When a selection cancels a pending close, focus is still on the background
     button that was clicked (the inert root blurred the dialog); pull it back
     into the still-open modal. The dismiss hook's inert cleanup has already
     run by the time this effect fires. Skipped on the finish path because
     open flips false in the same commit. */
  const wasClosingRef = useRef(false)
  useEffect(() => {
    const wasClosing = wasClosingRef.current
    wasClosingRef.current = isClosing
    if (wasClosing && !isClosing && open) closeRef.current?.focus()
  }, [isClosing, open])

  /* The cache is the single data source (loadMemberProfile stores every
     success); the hook exists to drive the fetch, re-render on completion,
     and surface loading/error state. */
  const { error, isLoading } = useAsyncData({
    deps: [bioguideId],
    enabled: Boolean(bioguideId),
    load: () => loadMemberProfile(bioguideId as string),
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

  /* Cache read keyed by the current seed, so stale data from a previously
     viewed member can never leak in; prefetched profiles render stats on the
     very first frame with no loading flash. */
  const profile = getCachedMemberProfile(seed.bioguide_id)
  const name = profile?.name ?? seed.name
  const party = profile?.party ?? seed.party
  const state = profile?.state ?? seed.state
  const photoUrl = profile?.photo_url || seed.photo_url
  const hint = crossVoteHint(profile?.cross_vote_label ?? seed.cross_vote_label)
  /* No data and no error means the fetch for this member has not settled yet
     (isLoading can lag one render behind a seed change); treat it as loading
     rather than flashing "unavailable". */
  const isPending = isLoading || (profile === null && !error)
  const phase = statsPhase(profile, isPending, error)

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

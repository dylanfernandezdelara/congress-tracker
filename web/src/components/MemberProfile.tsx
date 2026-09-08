import { useId } from 'react'
import { ExternalLink } from 'lucide-react'

import type { MemberProfileResponse, NotableVoteEntry } from '../api/types'
import { partyShortLabel } from '@congress-tracker/shared/party'
import { crossVoteHint } from '@congress-tracker/shared/notable-votes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { congressOrdinal, formatBillDocket, formatVoteDate } from '../utils/billLabels'
import { useMemberProfile } from '../hooks/useMemberProfile'
import { AnimatedSheet } from './AnimatedSheet'
import { MemberAvatar } from './MemberAvatar'
import { PartyBadge } from './PartyBadge'

export type MemberProfileSeed = Pick<
  NotableVoteEntry['defectors'][number],
  'bioguide_id' | 'name' | 'party' | 'state' | 'photo_url' | 'cross_vote_count' | 'cross_vote_label'
>

type MemberProfileProps = {
  open: boolean
  seed: MemberProfileSeed | null
  /* Must be bumped by the parent on every selection (including re-selecting
     the same member); a change cancels a pending animated close so the dialog
     stays open for the new selection instead of dismissing it. */
  selectionKey: number
  /* Fires after the exit animation completes (immediately under reduced
     motion); the parent should unmount/clear the seed in response. */
  onClose: () => void
}

type StatsPhase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable' }
  | { kind: 'ready'; profile: MemberProfileResponse }

function seatBadge(profile: MemberProfileResponse | null, seed: MemberProfileSeed): string {
  if (!profile) return `${partyShortLabel(seed.party)}-${seed.state}`
  if (profile.chamber === 'Senate') return `Senator · ${profile.state}`
  // Congress.gov uses district 0 for at-large House seats; null means unknown.
  if (profile.district === 0) return `${profile.state} at-large`
  if (profile.district != null && profile.district > 0) {
    return `${profile.state}-${profile.district}`
  }
  return `Representative from ${profile.state}`
}

function votingRecordTitle(profile: MemberProfileResponse | null): string {
  if (!profile) return 'Voting record'
  return `Voting record · ${congressOrdinal(profile.congress)} Congress, session ${profile.session}`
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

export function MemberProfile({ open, seed, selectionKey, onClose }: MemberProfileProps) {
  const titleId = useId()
  const bioguideId = open ? seed?.bioguide_id ?? null : null

  /* Prefetched profiles render stats on the very first frame with no loading
     flash; everything returned is scoped to the current member, so stale data
     or errors from a previously viewed member can never leak in. */
  const { profile, error, isPending } = useMemberProfile(bioguideId)

  if (!seed) return null

  const name = profile?.name ?? seed.name
  const party = profile?.party ?? seed.party
  const photoUrl = profile?.photo_url || seed.photo_url
  const hint = crossVoteHint(profile?.cross_vote_label ?? seed.cross_vote_label)
  const phase = statsPhase(profile, isPending, error)

  return (
    <AnimatedSheet
      open={open}
      selectionKey={selectionKey}
      onClose={onClose}
      titleId={titleId}
      closeAriaLabel="Close profile"
    >
      <div className="flex items-center gap-3.5">
        <MemberAvatar key={seed.bioguide_id} name={name} photoUrl={photoUrl} variant="profile" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id={titleId} className="member-profile-name">
            {name}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <PartyBadge party={party} />
            <Badge variant="outline">{seatBadge(profile, seed)}</Badge>
            {profile ? <Badge variant="outline">{profile.chamber}</Badge> : null}
          </div>
        </div>
      </div>

      <Separator />

      <section aria-label="Voting behavior">
        <Card>
          <CardHeader>
            <h3 className="font-semibold leading-none tracking-tight">{votingRecordTitle(profile)}</h3>
            <CardDescription>{hint}</CardDescription>
          </CardHeader>
          <CardContent>
            {phase.kind === 'ready' ? (
              <dl className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[0.6875rem] text-faint">Passage votes</dt>
                  <dd className="m-0 text-[0.9375rem] font-semibold tabular-nums">
                    {phase.profile.votes_cast}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[0.6875rem] text-faint">Yea · Nay</dt>
                  <dd className="m-0 text-[0.9375rem] font-semibold tabular-nums">
                    {phase.profile.yea_count} / {phase.profile.nay_count}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[0.6875rem] text-faint">Party-line breaks</dt>
                  <dd className="m-0 text-[0.9375rem] font-semibold tabular-nums">
                    {phase.profile.cross_vote_count}
                  </dd>
                </div>
              </dl>
            ) : null}
            {phase.kind === 'loading' ? (
              <p className="text-muted-foreground">Loading session voting stats…</p>
            ) : null}
            {phase.kind === 'error' ? (
              <p className="text-muted-foreground">{phase.message}</p>
            ) : null}
            {phase.kind === 'unavailable' ? (
              <p className="text-muted-foreground">
                Per-member vote history is not available for this session yet.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {phase.kind === 'ready' && phase.profile.recent_cross_votes.length > 0 ? (
        <section aria-label="Recent party-line breaks">
          <Card>
            <CardHeader>
              <h3 className="font-semibold leading-none tracking-tight">Recent party-line breaks</h3>
            </CardHeader>
            <CardContent>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {phase.profile.recent_cross_votes.map((vote) => (
                  <li
                    key={`${vote.chamber}-${vote.congress}-${vote.session}-${vote.roll_number}`}
                    className="flex flex-col gap-0.5"
                  >
                    <span className="text-[0.8125rem] font-semibold">
                      {formatBillDocket(vote.bill_type, vote.bill_number, vote.bill_congress)}
                    </span>
                    <span className="text-xs text-secondary">
                      {vote.chamber} · {formatVoteDate(vote.vote_date)} · voted{' '}
                      {positionWord(vote.position)} (party {positionWord(vote.party_line)})
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {profile?.congress_gov_url ? (
        <Button asChild variant="outline" size="sm">
          <a href={profile.congress_gov_url} target="_blank" rel="noopener noreferrer">
            View on Congress.gov
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    </AnimatedSheet>
  )
}

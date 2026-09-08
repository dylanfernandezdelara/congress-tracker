import { useId } from 'react'
import { ExternalLink } from 'lucide-react'

import { bioguidePhotoUrl } from '@congress-tracker/shared/member-photo'
import { crossVoteHint } from '@congress-tracker/shared/notable-votes'
import { partyShortLabel } from '@congress-tracker/shared/party'

import type { MemberProfileResponse, MemberProfileSponsoredBill } from '../api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  congressGovBillUrl,
  congressOrdinal,
  formatShortBillId,
  formatVoteDate,
  getBillColloquialName,
} from '../utils/billLabels'
import { useMemberProfile } from '../hooks/useMemberProfile'
import { AnimatedSheet } from './AnimatedSheet'
import { MemberAvatar } from './MemberAvatar'
import { PartyBadge } from './PartyBadge'
import { ProfileBillRow } from './ProfileBillRow'

export type MemberProfileCrossVoteLabel = 'rare' | 'occasional' | 'frequent'

/** Fields the profile sheet can render before `/stats/member.json` returns. */
export type MemberProfileSeed = {
  bioguide_id: string
  name: string
  party: string
  state: string
  photo_url?: string | null
  cross_vote_count?: number
  cross_vote_label?: MemberProfileCrossVoteLabel
}

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

function againstPartyLabel(position: 'yea' | 'nay'): string {
  return position === 'yea' ? 'Voted yea against party' : 'Voted nay against party'
}

function billHref(inFeed: boolean, billId: string, congress: number, type: string, number: number): string {
  if (inFeed) return `/?bill=${billId}`
  return congressGovBillUrl(congress, type, number)
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

function SponsoredBillsSection({
  profile,
  onClose,
}: {
  profile: MemberProfileResponse
  onClose: () => void
}) {
  const bills = profile.sponsored_bills
  if (bills.length === 0 && !profile.member_votes_available) return null

  return (
    <section className="sheet-section" aria-label="Sponsored bills">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <h3 className="sheet-section-title">Sponsored bills</h3>
        {bills.length > 0 && profile.sponsored_bills_total > bills.length ? (
          <p className="m-0 text-[0.6875rem] text-faint">
            {bills.length} of {profile.sponsored_bills_total}
          </p>
        ) : null}
      </div>
      {bills.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {bills.map((bill) => (
            <SponsoredBillItem key={bill.bill_id} bill={bill} onClose={onClose} />
          ))}
        </ul>
      ) : (
        <p className="sheet-muted">No sponsored bills in this Congress</p>
      )}
    </section>
  )
}

function SponsoredBillItem({
  bill,
  onClose,
}: {
  bill: MemberProfileSponsoredBill
  onClose: () => void
}) {
  const title = getBillColloquialName({
    congress: bill.congress,
    type: bill.bill_type,
    number: bill.bill_number,
    title: bill.title,
    headline: bill.headline,
  })
  const shortId = formatShortBillId(bill.bill_type, bill.bill_number)
  return (
    <li className="min-w-0">
      <ProfileBillRow
        title={title}
        href={billHref(bill.in_feed, bill.bill_id, bill.congress, bill.bill_type, bill.bill_number)}
        inFeed={bill.in_feed}
        onAfterNavigate={onClose}
      >
        <span className="text-xs text-secondary">
          {shortId}
          {bill.introduced_date ? ` · ${formatVoteDate(bill.introduced_date)}` : null}
        </span>
      </ProfileBillRow>
      {bill.latest_action_text ? (
        <p className="m-0 truncate text-xs text-faint" title={bill.latest_action_text}>
          {bill.latest_action_text}
        </p>
      ) : null}
      {bill.policy_area ? (
        <Badge variant="outline" className="mt-1 max-w-full truncate font-medium" title={bill.policy_area}>
          {bill.policy_area}
        </Badge>
      ) : null}
    </li>
  )
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
  const seedPhoto = seed.photo_url ?? bioguidePhotoUrl(seed.bioguide_id) ?? ''
  const photoUrl = profile?.photo_url || seedPhoto
  const hintLabel = profile?.cross_vote_label ?? seed.cross_vote_label
  const hint = hintLabel ? crossVoteHint(hintLabel) : null
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
          <h2 id={titleId} className="m-0 text-lg font-bold leading-tight tracking-tight">
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

      <section className="sheet-section" aria-label="Voting record">
        <h3 className="sheet-section-title">{votingRecordTitle(profile)}</h3>
        {hint ? <p className="sheet-muted">{hint}</p> : null}
        {phase.kind === 'ready' ? (
          <dl className="mt-1.5 grid grid-cols-3 gap-2">
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
          <p className="sheet-muted">Loading session voting stats…</p>
        ) : null}
        {phase.kind === 'error' ? (
          <p className="sheet-muted">{phase.message}</p>
        ) : null}
        {phase.kind === 'unavailable' ? (
          <p className="sheet-muted">
            Per-member vote history is not available for this session yet.
          </p>
        ) : null}
      </section>

      {phase.kind === 'ready' && phase.profile.recent_cross_votes.length > 0 ? (
        <section className="sheet-section" aria-label="Recent party-line breaks">
          <h3 className="sheet-section-title">Recent party-line breaks</h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {phase.profile.recent_cross_votes.map((vote) => {
              const title = getBillColloquialName({
                congress: vote.bill_congress,
                type: vote.bill_type,
                number: vote.bill_number,
                title: vote.title,
                headline: vote.headline,
              })
              const shortId = formatShortBillId(vote.bill_type, vote.bill_number)
              return (
                <li
                  key={`${vote.chamber}-${vote.congress}-${vote.session}-${vote.roll_number}`}
                  className="min-w-0"
                >
                  <ProfileBillRow
                    title={title}
                    href={billHref(
                      vote.in_feed,
                      vote.bill_id,
                      vote.bill_congress,
                      vote.bill_type,
                      vote.bill_number,
                    )}
                    inFeed={vote.in_feed}
                    onAfterNavigate={onClose}
                  >
                    <span className="text-xs text-secondary">
                      {shortId} · {formatVoteDate(vote.vote_date)} · {againstPartyLabel(vote.position)}{' '}
                      · margin {vote.margin}
                    </span>
                  </ProfileBillRow>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {profile ? <SponsoredBillsSection profile={profile} onClose={onClose} /> : null}

      {profile?.congress_gov_url ? (
        <Button asChild variant="outline" size="sm" className="self-start">
          <a href={profile.congress_gov_url} target="_blank" rel="noopener noreferrer">
            View on Congress.gov
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    </AnimatedSheet>
  )
}

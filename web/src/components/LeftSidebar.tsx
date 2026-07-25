import { useCallback, useState, type ReactNode } from 'react'

import { bioguidePhotoUrl, congressGovMemberUrl } from '@congress-tracker/shared/member-photo'
import { crossVoteLabel } from '@congress-tracker/shared/notable-votes'

import { prefetchMemberProfile } from '../api/memberProfileCache'
import type {
  DefectorEntry,
  PortfolioEntry,
  PortfolioMovers,
  SessionStatsResponse,
} from '../api/types'
import type { UseAsyncDataResult } from '../hooks/useAsyncData'
import type { ChamberPair } from '../hooks/useStatsData'
import { formatBillDocket, formatCoverageDate } from '../utils/billLabels'
import { MemberProfile, type MemberProfileSeed } from './MemberProfile'

type LeftSidebarProps = {
  session: UseAsyncDataResult<SessionStatsResponse>
  defectors: UseAsyncDataResult<ChamberPair<DefectorEntry[]>>
  portfolios: UseAsyncDataResult<ChamberPair<PortfolioMovers>>
  onRetry?: () => void
}

type MemberSpotlight = {
  bioguide_id: string
  name: string
  party: string
  state: string
  hook: string
  href: string | null
  tone?: 'neutral' | 'gain' | 'loss'
  cross_vote_count: number
}

const MAX_SPOTLIGHTS = 3

function formatPartyState(party: string | null, state: string | null): string {
  if (party && state) return `${party} · ${state}`
  return party ?? state ?? ''
}

function defectorHook(entry: DefectorEntry): string {
  const votes =
    entry.cross_vote_count === 1
      ? '1 cross-party vote'
      : `${entry.cross_vote_count} cross-party votes`

  if (entry.recent_example) {
    const bill = formatBillDocket(
      entry.recent_example.bill_type,
      entry.recent_example.bill_number,
      entry.recent_example.congress,
    )
    const margin =
      entry.recent_example.margin === 1
        ? 'a one-vote margin'
        : `a ${entry.recent_example.margin}-vote margin`
    return `Broke with party on ${bill} (${margin}) · ${votes} total`
  }

  return `Most often voted against party caucus · ${votes}`
}

function portfolioHook(entry: PortfolioEntry, direction: 'gain' | 'loss'): string {
  const pct = Math.abs(entry.session_return_pct).toFixed(1)
  if (direction === 'gain') {
    return `Disclosed holdings estimated up ${pct}% this session`
  }
  return `Disclosed holdings estimated down ${pct}% this session`
}

function buildSpotlights(
  defectors: DefectorEntry[],
  portfolios: PortfolioMovers | undefined,
): MemberSpotlight[] {
  const seen = new Set<string>()
  const spotlights: MemberSpotlight[] = []

  for (const defector of defectors) {
    if (spotlights.length >= MAX_SPOTLIGHTS) break
    seen.add(defector.bioguide_id)
    spotlights.push({
      bioguide_id: defector.bioguide_id,
      name: defector.name,
      party: defector.party,
      state: defector.state,
      hook: defectorHook(defector),
      href: defector.congress_gov_url,
      tone: 'neutral',
      cross_vote_count: defector.cross_vote_count,
    })
  }

  const portfolioPeople: Array<{ entry: PortfolioEntry; direction: 'gain' | 'loss' }> = [
    ...(portfolios?.gainers ?? []).map((entry) => ({ entry, direction: 'gain' as const })),
    ...(portfolios?.losers ?? []).map((entry) => ({ entry, direction: 'loss' as const })),
  ]

  for (const { entry, direction } of portfolioPeople) {
    if (spotlights.length >= MAX_SPOTLIGHTS) break
    if (seen.has(entry.bioguide_id)) continue
    seen.add(entry.bioguide_id)
    spotlights.push({
      bioguide_id: entry.bioguide_id,
      name: entry.name,
      party: entry.party ?? '',
      state: entry.state ?? '',
      hook: portfolioHook(entry, direction),
      href: congressGovMemberUrl(entry.bioguide_id, entry.name),
      tone: direction === 'gain' ? 'gain' : 'loss',
      cross_vote_count: 0,
    })
  }

  return spotlights
}

function spotlightToSeed(member: MemberSpotlight): MemberProfileSeed {
  return {
    bioguide_id: member.bioguide_id,
    name: member.name,
    party: member.party,
    state: member.state,
    photo_url: bioguidePhotoUrl(member.bioguide_id) ?? '',
    cross_vote_count: member.cross_vote_count,
    cross_vote_label: crossVoteLabel(member.cross_vote_count),
  }
}

function MemberSpotlightCard({
  member,
  onOpenProfile,
}: {
  member: MemberSpotlight
  onOpenProfile: (seed: MemberProfileSeed) => void
}) {
  const meta = formatPartyState(member.party || null, member.state || null)
  const canOpenProfile = member.bioguide_id.trim().length > 0

  let nameEl: ReactNode
  if (canOpenProfile) {
    const seed = spotlightToSeed(member)
    nameEl = (
      <button
        type="button"
        className="member-spotlight-name"
        onClick={() => onOpenProfile(seed)}
        onMouseEnter={() => prefetchMemberProfile(member.bioguide_id)}
        onFocus={() => prefetchMemberProfile(member.bioguide_id)}
        aria-label={`Open profile for ${member.name}`}
      >
        {member.name}
      </button>
    )
  } else if (member.href) {
    nameEl = (
      <a
        href={member.href}
        target="_blank"
        rel="noopener noreferrer"
        className="member-spotlight-name congress-link"
      >
        {member.name}
      </a>
    )
  } else {
    nameEl = <p className="member-spotlight-name">{member.name}</p>
  }

  return (
    <article className="member-spotlight">
      <div className="member-spotlight-header">
        {nameEl}
        {meta ? <span className="member-spotlight-party">{meta}</span> : null}
      </div>
      <p
        className={
          member.tone === 'gain'
            ? 'member-spotlight-hook text-pass'
            : member.tone === 'loss'
              ? 'member-spotlight-hook text-fail'
              : 'member-spotlight-hook'
        }
      >
        {member.hook}
      </p>
    </article>
  )
}

function ChamberSection({
  title,
  defectors,
  portfolios,
  defectorsLoading,
  portfoliosLoading,
  defectorsError,
  portfoliosError,
  onOpenProfile,
}: {
  title: 'House' | 'Senate'
  defectors: DefectorEntry[]
  portfolios: PortfolioMovers | undefined
  defectorsLoading: boolean
  portfoliosLoading: boolean
  defectorsError: string | null
  portfoliosError: string | null
  onOpenProfile: (seed: MemberProfileSeed) => void
}) {
  const spotlights = buildSpotlights(
    defectorsError ? [] : defectors,
    portfoliosError ? undefined : portfolios,
  )
  const loading = defectorsLoading || portfoliosLoading

  return (
    <section className="sidebar-chamber">
      <h2 className="sidebar-kicker">{title}</h2>

      {loading && spotlights.length === 0 ? (
        <p className="member-spotlight-empty">Loading members…</p>
      ) : null}
      {defectorsError ? (
        <p className="member-spotlight-empty text-fail">{defectorsError}</p>
      ) : null}
      {portfoliosError ? (
        <p className="member-spotlight-empty text-fail">{portfoliosError}</p>
      ) : null}
      {!loading && spotlights.length === 0 && !defectorsError && !portfoliosError ? (
        <p className="member-spotlight-empty">
          No member highlights yet. Check back after the next data refresh.
        </p>
      ) : null}
      {spotlights.length > 0 ? (
        <div className="member-spotlight-list">
          {spotlights.map((member) => (
            <MemberSpotlightCard
              key={member.bioguide_id}
              member={member}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function LeftSidebar({ session, defectors, portfolios, onRetry }: LeftSidebarProps) {
  const [selection, setSelection] = useState<{ seed: MemberProfileSeed; key: number } | null>(
    null,
  )

  const openProfile = useCallback((seed: MemberProfileSeed) => {
    setSelection((prev) => ({ seed, key: (prev?.key ?? 0) + 1 }))
  }, [])

  const coverage =
    session.data && session.data.house.date_range.last
      ? `${session.data.congress}th Congress, ${session.data.session}${ordinal(session.data.session)} session · through ${formatCoverageDate(session.data.house.date_range.last)}`
      : null

  const disclaimer = portfolios.data?.house.disclaimer ?? portfolios.data?.senate.disclaimer
  const hasMemberDataError = Boolean(
    defectors.error ||
      portfolios.error ||
      defectors.data?.houseError ||
      defectors.data?.senateError ||
      portfolios.data?.houseError ||
      portfolios.data?.senateError,
  )

  return (
    <div className="sidebar-panel space-y-5">
      {coverage && !session.isLoading ? (
        <p className="sidebar-coverage">{coverage}</p>
      ) : null}
      {session.error && onRetry ? (
        <button type="button" className="ghost-button text-xs" onClick={onRetry}>
          Retry sidebar
        </button>
      ) : null}
      {!session.error && hasMemberDataError && onRetry ? (
        <button type="button" className="ghost-button text-xs" onClick={onRetry}>
          Retry member data
        </button>
      ) : null}
      <ChamberSection
        title="House"
        defectors={defectors.data?.house ?? []}
        portfolios={portfolios.data?.house}
        defectorsLoading={defectors.isLoading}
        portfoliosLoading={portfolios.isLoading}
        defectorsError={defectors.error ?? defectors.data?.houseError ?? null}
        portfoliosError={portfolios.error ?? portfolios.data?.houseError ?? null}
        onOpenProfile={openProfile}
      />
      <div className="border-t border-border" />
      <ChamberSection
        title="Senate"
        defectors={defectors.data?.senate ?? []}
        portfolios={portfolios.data?.senate}
        defectorsLoading={defectors.isLoading}
        portfoliosLoading={portfolios.isLoading}
        defectorsError={defectors.error ?? defectors.data?.senateError ?? null}
        portfoliosError={portfolios.error ?? portfolios.data?.senateError ?? null}
        onOpenProfile={openProfile}
      />
      {disclaimer ? <p className="sidebar-disclaimer">{disclaimer}</p> : null}
      <MemberProfile
        open={selection !== null}
        seed={selection?.seed ?? null}
        selectionKey={selection?.key ?? 0}
        onClose={() => setSelection(null)}
      />
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}

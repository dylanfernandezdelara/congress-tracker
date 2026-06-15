import type {
  DefectorEntry,
  PortfolioEntry,
  PortfolioMovers,
  SessionStatsResponse,
} from '../api/types'
import { formatBillDocket } from '../utils/billLabels'

type LeftSidebarProps = {
  session: SessionStatsResponse | null
  defectors: { house: DefectorEntry[]; senate: DefectorEntry[] } | null
  portfolios: { house: PortfolioMovers; senate: PortfolioMovers } | null
  sessionLoading: boolean
  defectorsLoading: boolean
  portfoliosLoading: boolean
  sessionError: string | null
  defectorsError: string | null
  portfoliosError: string | null
  onRetry?: () => void
}

type MemberSpotlight = {
  bioguide_id: string
  name: string
  party: string
  state: string
  hook: string
  href?: string
  tone?: 'neutral' | 'gain' | 'loss'
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
      tone: direction === 'gain' ? 'gain' : 'loss',
    })
  }

  return spotlights
}

function MemberSpotlightCard({ member }: { member: MemberSpotlight }) {
  const meta = formatPartyState(member.party || null, member.state || null)
  const nameEl = member.href ? (
    <a href={member.href} target="_blank" rel="noreferrer" className="member-spotlight-name congress-link">
      {member.name}
    </a>
  ) : (
    <p className="member-spotlight-name">{member.name}</p>
  )

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
}: {
  title: 'House' | 'Senate'
  defectors: DefectorEntry[]
  portfolios: PortfolioMovers | undefined
  defectorsLoading: boolean
  portfoliosLoading: boolean
  defectorsError: string | null
  portfoliosError: string | null
}) {
  const spotlights = buildSpotlights(
    defectorsError ? [] : defectors,
    portfoliosError ? undefined : portfolios,
  )
  const loading = defectorsLoading || portfoliosLoading

  return (
    <section className="sidebar-chamber">
      <h2 className="sidebar-chamber-title text-[11px] font-semibold uppercase tracking-widest text-faint">
        {title}
      </h2>

      {loading && spotlights.length === 0 ? (
        <p className="member-spotlight-empty">Loading members…</p>
      ) : null}
      {defectorsError ? (
        <p className="member-spotlight-empty text-fail">Defectors unavailable: {defectorsError}</p>
      ) : null}
      {portfoliosError ? (
        <p className="member-spotlight-empty text-fail">Portfolio data unavailable: {portfoliosError}</p>
      ) : null}
      {!loading && spotlights.length === 0 && !defectorsError && !portfoliosError ? (
        <p className="member-spotlight-empty">
          No member highlights in stored data yet. Locally run <code className="text-xs">npm run seed</code>;
          in preview or production run the session-backfill and member-votes admin pipelines.
        </p>
      ) : null}
      {spotlights.length > 0 ? (
        <div className="member-spotlight-list">
          {spotlights.map((member) => (
            <MemberSpotlightCard key={member.bioguide_id} member={member} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function LeftSidebar({
  session,
  defectors,
  portfolios,
  sessionLoading,
  defectorsLoading,
  portfoliosLoading,
  sessionError,
  defectorsError,
  portfoliosError,
  onRetry,
}: LeftSidebarProps) {
  const coverage =
    session && session.house.date_range.last
      ? `${session.congress}th Congress, ${session.session}${ordinal(session.session)} session · through ${session.house.date_range.last}`
      : null

  const disclaimer = portfolios?.house.disclaimer ?? portfolios?.senate.disclaimer

  return (
    <div className="sidebar-panel space-y-5">
      {coverage && !sessionLoading ? (
        <p className="sidebar-coverage text-[11px] leading-snug text-faint">{coverage}</p>
      ) : null}
      {sessionError && onRetry ? (
        <button type="button" className="ghost-button text-xs" onClick={onRetry}>
          Retry sidebar
        </button>
      ) : null}
      {!sessionError && (defectorsError || portfoliosError) && onRetry ? (
        <button type="button" className="ghost-button text-xs" onClick={onRetry}>
          Retry member data
        </button>
      ) : null}
      <ChamberSection
        title="House"
        defectors={defectors?.house ?? []}
        portfolios={portfolios?.house}
        defectorsLoading={defectorsLoading}
        portfoliosLoading={portfoliosLoading}
        defectorsError={defectorsError}
        portfoliosError={portfoliosError}
      />
      <div className="border-t border-border" />
      <ChamberSection
        title="Senate"
        defectors={defectors?.senate ?? []}
        portfolios={portfolios?.senate}
        defectorsLoading={defectorsLoading}
        portfoliosLoading={portfoliosLoading}
        defectorsError={defectorsError}
        portfoliosError={portfoliosError}
      />
      {disclaimer ? <p className="sidebar-disclaimer text-[11px] leading-snug text-faint">{disclaimer}</p> : null}
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}

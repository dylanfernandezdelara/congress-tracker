import type {
  ChamberStats,
  DefectorEntry,
  PortfolioMovers,
  SessionStatsResponse,
} from '../api/types'

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

function ChamberSection({
  title,
  stats,
  defectors,
  portfolios,
  statsLoading,
  defectorsLoading,
  portfoliosLoading,
  statsError,
  defectorsError,
  portfoliosError,
}: {
  title: 'House' | 'Senate'
  stats: ChamberStats | undefined
  defectors: DefectorEntry[]
  portfolios: PortfolioMovers | undefined
  statsLoading: boolean
  defectorsLoading: boolean
  portfoliosLoading: boolean
  statsError: string | null
  defectorsError: string | null
  portfoliosError: string | null
}) {
  return (
    <section className="sidebar-chamber space-y-4">
      <h2 className="sidebar-chamber-title text-[11px] font-semibold uppercase tracking-widest text-faint">
        {title}
      </h2>

      <div className="sidebar-widget space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Session stats</h3>
        {statsLoading ? <p className="text-xs text-faint">Loading…</p> : null}
        {statsError ? <p className="text-xs text-fail">{statsError}</p> : null}
        {stats && !statsLoading ? (
          <ul className="space-y-1 text-[12px] text-secondary">
            <li>{stats.passage_vote_count} passage votes</li>
            <li>{stats.unique_bills_passed} bills passed</li>
            <li>Avg margin: {stats.avg_margin.toFixed(1)}</li>
            <li>Closest margin: {stats.closest_margin}</li>
            {stats.date_range.first ? (
              <li className="text-faint">
                {stats.date_range.first} – {stats.date_range.last}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className="sidebar-widget space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Top party defectors</h3>
        {defectorsLoading ? <p className="text-xs text-faint">Loading…</p> : null}
        {defectorsError ? <p className="text-xs text-fail">{defectorsError}</p> : null}
        {!defectorsLoading && !defectorsError && defectors.length === 0 ? (
          <p className="text-xs text-faint">No defector data yet.</p>
        ) : null}
        {defectors.length > 0 ? (
          <ol className="space-y-2">
            {defectors.map((d) => (
              <li key={d.bioguide_id} className="text-[12px]">
                <a
                  href={d.congress_gov_url}
                  target="_blank"
                  rel="noreferrer"
                  className="congress-link font-medium"
                >
                  {d.name}
                </a>
                <span className="text-faint">
                  {' '}
                  · {d.party}-{d.state} · score {d.deciding_score.toFixed(1)}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <div className="sidebar-widget space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Portfolio movers</h3>
        {portfoliosLoading ? <p className="text-xs text-faint">Loading…</p> : null}
        {portfoliosError ? <p className="text-xs text-fail">{portfoliosError}</p> : null}
        {portfolios && !portfoliosLoading ? (
          <div className="space-y-3 text-[12px] text-secondary">
            {portfolios.gainers.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-faint">Top gainers</p>
                <ol className="space-y-1">
                  {portfolios.gainers.map((g) => (
                    <li key={g.bioguide_id}>
                      {g.name}{' '}
                      <span className="text-pass">+{g.session_return_pct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {portfolios.losers.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-faint">Top losers</p>
                <ol className="space-y-1">
                  {portfolios.losers.map((l) => (
                    <li key={l.bioguide_id}>
                      {l.name}{' '}
                      <span className="text-fail">{l.session_return_pct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {portfolios.gainers.length === 0 && portfolios.losers.length === 0 ? (
              <p className="text-xs text-faint">No disclosure data yet.</p>
            ) : null}
            {portfolios.disclaimer ? (
              <p className="text-[11px] leading-snug text-faint">{portfolios.disclaimer}</p>
            ) : null}
          </div>
        ) : null}
      </div>
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
      ? `${session.congress}th Congress, ${session.session}${ordinal(session.session)} session · data through ${session.house.date_range.last}`
      : null

  return (
    <div className="sidebar-panel space-y-6">
      {coverage ? <p className="text-[11px] leading-snug text-faint">{coverage}</p> : null}
      {sessionError && onRetry ? (
        <button type="button" className="ghost-button text-xs" onClick={onRetry}>
          Retry sidebar
        </button>
      ) : null}
      <ChamberSection
        title="House"
        stats={session?.house}
        defectors={defectors?.house ?? []}
        portfolios={portfolios?.house}
        statsLoading={sessionLoading}
        defectorsLoading={defectorsLoading}
        portfoliosLoading={portfoliosLoading}
        statsError={sessionError}
        defectorsError={defectorsError}
        portfoliosError={portfoliosError}
      />
      <div className="border-t border-border" />
      <ChamberSection
        title="Senate"
        stats={session?.senate}
        defectors={defectors?.senate ?? []}
        portfolios={portfolios?.senate}
        statsLoading={sessionLoading}
        defectorsLoading={defectorsLoading}
        portfoliosLoading={portfoliosLoading}
        statsError={sessionError}
        defectorsError={defectorsError}
        portfoliosError={portfoliosError}
      />
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}

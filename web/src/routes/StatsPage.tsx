import { ChamberCompositionOverview } from '../components/ChamberCompositionOverview'
import { LeftSidebar } from '../components/LeftSidebar'
import { RightRail } from '../components/RightRail'
import { useStatsData } from '../hooks/useStatsData'

export default function StatsPage() {
  const { reload, session, pulse, defectors, portfolios } = useStatsData()

  return (
    <main className="stats-page">
      <ChamberCompositionOverview
        composition={session.data?.composition ?? null}
        loading={session.isLoading}
        error={session.error}
        onRetry={reload}
      />

      <section aria-label="Members in Congress">
        <LeftSidebar
          session={session}
          defectors={defectors}
          portfolios={portfolios}
          onRetry={reload}
        />
      </section>
      <section aria-label="Legislative pulse">
        <RightRail
          pulse={pulse.data}
          loading={pulse.isLoading}
          error={pulse.error}
          onRetry={reload}
        />
      </section>
    </main>
  )
}

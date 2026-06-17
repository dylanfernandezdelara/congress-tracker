import { LeftSidebar } from '../components/LeftSidebar'
import { RightRail } from '../components/RightRail'
import { useStatsData } from '../hooks/useStatsData'

export default function StatsPage() {
  const { reload, session, pulse, defectors, portfolios } = useStatsData()

  return (
    <main className="stats-page">
      <section aria-label="Members in Congress">
        <LeftSidebar
          session={session.data}
          defectors={defectors.data}
          portfolios={portfolios.data}
          sessionLoading={session.isLoading}
          defectorsLoading={defectors.isLoading}
          portfoliosLoading={portfolios.isLoading}
          sessionError={session.error}
          defectorsError={defectors.error}
          portfoliosError={portfolios.error}
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

import { Outlet } from 'react-router-dom'

import { ErrorBoundary } from '../components/ErrorBoundary'
import { PageShell } from '../components/PageShell'
import { useAlignGrid } from '../hooks/useAlignGrid'

export function AppLayout() {
  useAlignGrid()
  return (
    <PageShell>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </PageShell>
  )
}

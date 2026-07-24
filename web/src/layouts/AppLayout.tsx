import { Outlet } from 'react-router-dom'

import { ErrorBoundary } from '../components/ErrorBoundary'
import { PageShell } from '../components/PageShell'

export function AppLayout() {
  return (
    <PageShell>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </PageShell>
  )
}

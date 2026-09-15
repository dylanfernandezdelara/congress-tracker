import { Outlet } from 'react-router-dom'

import { ErrorBoundary } from '../components/ErrorBoundary'
import { PageShell } from '../components/PageShell'
import { TooltipProvider } from '../components/ui/tooltip'
import { useAlignGrid } from '../hooks/useAlignGrid'

export function AppLayout() {
  useAlignGrid()
  return (
    <TooltipProvider delayDuration={300}>
      <PageShell>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </PageShell>
    </TooltipProvider>
  )
}

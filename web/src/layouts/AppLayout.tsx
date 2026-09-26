import { Outlet } from 'react-router-dom'

import { Toaster } from '@/components/dfdl/toast'
import { toastManager } from '@/lib/toast'

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
      <Toaster variant="pill" limit={1} timeout={2800} toastManager={toastManager} />
    </PageShell>
  )
}

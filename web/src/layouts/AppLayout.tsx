import { Outlet } from 'react-router-dom'

import { PageShell } from '../components/PageShell'

export function AppLayout() {
  return (
    <PageShell>
      <Outlet />
    </PageShell>
  )
}

import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { ExecutiveAlertBanner } from './ExecutiveAlertBanner'
import { SiteHeader } from './SiteHeader'

type PageShellProps = {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  const { pathname } = useLocation()
  const playRoute = pathname === '/play'

  return (
    <div className={`page-shell mx-auto min-h-screen w-full max-w-[1440px]${playRoute ? ' page-shell--play' : ''}`}>
      <SiteHeader compact={playRoute} />
      {!playRoute ? <ExecutiveAlertBanner /> : null}
      <div className="page-main min-w-0">{children}</div>
    </div>
  )
}

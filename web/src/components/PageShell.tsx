import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { SiteHeader } from './SiteHeader'
import { SiteNav } from './SiteNav'

type PageShellProps = {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  const { pathname } = useLocation()
  const playRoute = pathname === '/play'

  return (
    <div className={`page-shell mx-auto min-h-screen w-full max-w-[1440px]${playRoute ? ' page-shell--play' : ''}`}>
      <SiteHeader compact={playRoute} />
      <SiteNav />
      <div className="page-main min-w-0">{children}</div>
    </div>
  )
}

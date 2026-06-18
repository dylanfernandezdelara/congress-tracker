import type { ReactNode } from 'react'

import { SiteHeader } from './SiteHeader'
import { SiteNav } from './SiteNav'

type PageShellProps = {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-shell mx-auto min-h-screen w-full max-w-[1440px]">
      <SiteHeader />
      <SiteNav />
      <div className="page-main min-w-0">{children}</div>
    </div>
  )
}

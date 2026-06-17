import type { ReactNode } from 'react'

import { SiteHeader } from './SiteHeader'
import { SiteNav } from './SiteNav'

type PageShellProps = {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-shell mx-auto min-h-screen w-full max-w-[1440px] px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
      <SiteHeader />
      <SiteNav />
      <div className="page-main mt-6 min-w-0">{children}</div>
    </div>
  )
}

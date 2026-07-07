import type { ReactNode } from 'react'

import { SiteHeader } from './SiteHeader'

type PageShellProps = {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-shell mx-auto min-h-screen w-full max-w-[1440px]">
      <SiteHeader />
      <div className="page-main min-w-0">{children}</div>
    </div>
  )
}

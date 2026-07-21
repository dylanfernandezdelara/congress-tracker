import type { ReactNode } from 'react'

import { SiteHeader } from './SiteHeader'

type PageShellProps = {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-frame">
      <SiteHeader />
      <div className="page-shell">
        <div className="page-main min-w-0">{children}</div>
      </div>
    </div>
  )
}

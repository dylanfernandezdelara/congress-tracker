import type { ReactNode } from 'react'

import { SiteHeader } from './SiteHeader'

type PageShellProps = {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-frame">
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <div className="page-shell">
        <div className="page-main min-w-0">{children}</div>
      </div>
    </div>
  )
}

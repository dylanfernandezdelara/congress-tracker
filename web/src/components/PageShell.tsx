import type { ReactNode } from 'react'

import { SiteHeader } from './SiteHeader'

type PageShellProps = {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="page-frame min-h-screen w-full">
      <SiteHeader />
      <div className="page-shell mx-auto w-full max-w-[1440px]">
        <div className="page-main min-w-0">{children}</div>
      </div>
    </div>
  )
}

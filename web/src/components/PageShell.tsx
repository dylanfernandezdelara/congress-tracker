import type { ReactNode } from 'react'

import { SiteHeader } from './SiteHeader'

type PageShellProps = {
  leftSidebar: ReactNode
  rightRail: ReactNode
  children: ReactNode
}

export function PageShell({ leftSidebar, rightRail, children }: PageShellProps) {
  return (
    <div className="page-shell mx-auto min-h-screen w-full max-w-[1440px] px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
      <SiteHeader />
      <div className="page-grid mt-6">
        <aside className="page-sidebar-left hidden lg:block" aria-label="Congress session stats">
          {leftSidebar}
        </aside>
        <div className="page-main min-w-0">{children}</div>
        <aside className="page-sidebar-right hidden lg:block" aria-label="Legislative pulse">
          {rightRail}
        </aside>
      </div>
    </div>
  )
}

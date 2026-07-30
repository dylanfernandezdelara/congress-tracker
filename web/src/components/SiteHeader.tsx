import { BrandFlagIcon } from './BrandFlagIcon'
import { ThemeToggle } from './ThemeToggle'

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-brand">
          <BrandFlagIcon />
          <h1 className="site-header-title">Track Congress</h1>
        </div>

        <div className="site-header-actions">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

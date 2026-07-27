import { PixelFlagIcon } from './PixelFlagIcon'
import { ThemeToggle } from './ThemeToggle'

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-brand">
          <PixelFlagIcon />
          <h1 className="site-header-title">Congress Tracker</h1>
        </div>

        <div className="site-header-actions">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

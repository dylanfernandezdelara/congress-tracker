import { Link, NavLink } from 'react-router-dom'

import { BrandFlagIcon } from './BrandFlagIcon'
import { ThemeToggle } from './ThemeToggle'

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-header-brand">
          <BrandFlagIcon />
          <h1 className="site-header-title">Track Congress</h1>
        </Link>

        <div className="site-header-actions">
          <NavLink to="/midterms" className="site-header-nav-link">
            2026 midterms
          </NavLink>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

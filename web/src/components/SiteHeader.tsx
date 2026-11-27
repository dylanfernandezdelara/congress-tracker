import { Link, NavLink, useLocation } from 'react-router-dom'

import { BrandFlagIcon } from './BrandFlagIcon'
import { ThemeToggle } from './ThemeToggle'

export function SiteHeader() {
  // The brand is the page heading only on the feed; other pages bring their own h1.
  const Title = useLocation().pathname === '/' ? 'h1' : 'span'
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-header-brand">
          <BrandFlagIcon />
          <Title className="site-header-title">Track Congress</Title>
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

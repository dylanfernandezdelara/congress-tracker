import type { Ref } from 'react'
import { NavLink } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `site-nav-link${isActive ? ' is-active' : ''}`

type SiteNavProps = {
  id?: string
  navRef?: Ref<HTMLElement>
  onNavigate?: () => void
}

export function SiteNav({ id, navRef, onNavigate }: SiteNavProps) {
  return (
    <nav
      ref={navRef}
      className="site-nav"
      id={id}
      aria-label="Site sections"
    >
      <NavLink to="/" end className={linkClass} onClick={onNavigate}>
        Feed
      </NavLink>
      <NavLink to="/play" className={linkClass} onClick={onNavigate}>
        Play
      </NavLink>
      <NavLink to="/stats" className={linkClass} onClick={onNavigate}>
        Stats
      </NavLink>
    </nav>
  )
}

import { NavLink } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `site-nav-link${isActive ? ' is-active' : ''}`

export function SiteNav() {
  return (
    <div className="site-nav-wrap">
      <nav className="site-nav" aria-label="Site sections">
        <NavLink to="/" end className={linkClass}>
          Feed
        </NavLink>
        <NavLink to="/stats" className={linkClass}>
          Stats
        </NavLink>
      </nav>
    </div>
  )
}

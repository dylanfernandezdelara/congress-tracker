import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { PixelFlagIcon } from './PixelFlagIcon'
import { SiteNav } from './SiteNav'

type SiteHeaderProps = {
  compact?: boolean
}

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  const menuId = useId()
  const { pathname } = useLocation()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  useEffect(() => {
    closeMenu()
  }, [pathname, closeMenu])

  useEffect(() => {
    if (!menuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        toggleRef.current?.focus()
        return
      }

      if (event.key !== 'Tab') return
      const links = navRef.current?.querySelectorAll('a')
      const toggle = toggleRef.current
      if (!links?.length || !toggle) return

      const first = links[0] as HTMLAnchorElement
      const last = links[links.length - 1] as HTMLAnchorElement
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        toggle.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        toggle.focus()
      } else if (!event.shiftKey && active === toggle) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === toggle) {
        event.preventDefault()
        last.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return

    const firstLink = navRef.current?.querySelector('a')
    if (firstLink instanceof HTMLAnchorElement) {
      firstLink.focus()
    }
  }, [menuOpen])

  return (
    <header
      className={`site-header${compact ? ' site-header--compact' : ''}${menuOpen ? ' site-header--menu-open' : ''}`}
    >
      <div className="site-header-inner">
        <div className="site-header-brand">
          <PixelFlagIcon />
          <h1 className="site-header-title">Congress Tracker</h1>
        </div>

        <SiteNav id={menuId} navRef={navRef} onNavigate={closeMenu} />

        <button
          ref={toggleRef}
          type="button"
          className="site-nav-toggle"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="site-nav-toggle-bar" aria-hidden="true" />
          <span className="site-nav-toggle-bar" aria-hidden="true" />
          <span className="site-nav-toggle-bar" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

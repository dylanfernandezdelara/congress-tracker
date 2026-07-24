import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { PixelFlagIcon } from './PixelFlagIcon'
import { SiteNav } from './SiteNav'
import { ThemeToggle } from './ThemeToggle'

export function SiteHeader() {
  const menuId = useId()
  const { pathname } = useLocation()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const themeToggleRef = useRef<HTMLButtonElement>(null)
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
      const menuToggle = toggleRef.current
      const themeToggle = themeToggleRef.current
      if (!links?.length || !menuToggle) return

      const focusables = [
        ...Array.from(links),
        ...(themeToggle ? [themeToggle] : []),
        menuToggle,
      ] as HTMLElement[]
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
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
    <header className={`site-header${menuOpen ? ' site-header--menu-open' : ''}`}>
      <div className="site-header-inner">
        <div className="site-header-brand">
          <PixelFlagIcon />
          <h1 className="site-header-title">Congress Tracker</h1>
        </div>

        <SiteNav id={menuId} navRef={navRef} onNavigate={closeMenu} />

        <div className="site-header-actions">
          <ThemeToggle buttonRef={themeToggleRef} />
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
      </div>
    </header>
  )
}

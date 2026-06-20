import { ThemeToggle } from './ThemeToggle'

type SiteHeaderProps = {
  compact?: boolean
}

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header className={`site-header${compact ? ' site-header--compact' : ''}`}>
      <ThemeToggle />
      <h1 className="site-header-title">What is Congress Doing?</h1>
      <p className="site-header-meta">
        Plain-English recaps of the bills the House and Senate just voted on.
      </p>
    </header>
  )
}

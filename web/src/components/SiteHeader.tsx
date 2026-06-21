type SiteHeaderProps = {
  compact?: boolean
}

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header className={`site-header${compact ? ' site-header--compact' : ''}`}>
      <h1 className="site-header-title">Congress Tracker</h1>
    </header>
  )
}

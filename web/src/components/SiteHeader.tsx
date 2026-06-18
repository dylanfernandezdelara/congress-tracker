import { ThemeToggle } from './ThemeToggle'

export function SiteHeader() {
  return (
    <header className="site-header">
      <ThemeToggle />
      <h1 className="site-header-title">What is Congress Doing?</h1>
      <p className="site-header-meta">
        Plain-English recaps of the bills the House and Senate just voted on.
      </p>
    </header>
  )
}

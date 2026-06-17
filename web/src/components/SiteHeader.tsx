import { useEffect, useState } from 'react'

import { ThemeToggle } from './ThemeToggle'

function formatEasternNow(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date())
}

export function SiteHeader() {
  const [timestamp, setTimestamp] = useState(formatEasternNow)

  useEffect(() => {
    const id = window.setInterval(() => setTimestamp(formatEasternNow()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <header className="site-header">
      <ThemeToggle />
      <h1 className="site-header-title">What is Congress Doing?</h1>
      <p className="site-header-meta">{timestamp} · Washington, DC</p>
    </header>
  )
}

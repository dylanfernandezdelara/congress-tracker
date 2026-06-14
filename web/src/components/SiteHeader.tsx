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
    <header className="site-header space-y-4 pb-1">
      <div className="flex items-center justify-between gap-3">
        <p className="site-label flex items-center gap-1.5 text-[13px] font-medium text-faint">
          Congress Tracker
          <span className="inline-block h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        </p>
        <ThemeToggle />
      </div>

      <div className="space-y-2 text-center">
        <h1 className="text-[clamp(1.5rem,4vw,2rem)] font-semibold tracking-tight text-foreground">
          What is Congress Doing?
        </h1>
        <p className="text-xs text-faint">{timestamp} · Washington, DC</p>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-secondary">
          Plain-English summaries of every bill that just passed the House or Senate.
        </p>
      </div>

      <div className="border-t border-border" />
    </header>
  )
}

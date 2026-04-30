import { useEffect } from 'react'
import { Card, CardContent } from '../components/ui/card'

function About() {
  useEffect(() => {
    document.title = 'About | Congress Pulse'
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <Card className="draft-grid">
        <CardContent className="grid gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:px-8 lg:py-8">
          <div className="max-w-3xl">
            <p className="document-kicker">About Congress Pulse</p>
            <h1 className="document-title mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
              Neutral context for congressional vote summaries.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
              Congress Pulse is a public-interest briefing that summarizes recent congressional
              votes and explains what happened, the recorded tally, and who broke party lines.
            </p>
          </div>

          <aside className="space-y-3 lg:border-l lg:border-primary/15 lg:pl-6">
            <div className="note-panel">
              <p className="document-label">Editorial stance</p>
              <p className="mt-3 text-sm leading-6 text-foreground">
                The site is designed to read like a legislative briefing packet: official facts
                first, explicit context gaps, and clear chronological organization.
              </p>
            </div>
            <div className="note-panel">
              <p className="document-label">Primary sources</p>
              <p className="mt-3 text-sm leading-6 text-foreground">
                Congress.gov, Senate.gov, GovInfo, and linked official materials drive the briefing
                whenever the record is available.
              </p>
            </div>
          </aside>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardContent className="px-6 py-6">
            <p className="document-kicker">Intent</p>
            <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">
              What the site is trying to do
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              The project combines official sources including Congress.gov, Senate.gov, and GovInfo
              with transparent processing so readers can quickly see recent vote outcomes, where
              parties split, and when a result fits into a broader historical pattern.
            </p>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              It is intentionally designed as a simple chronological vote summary rather than a
              dense dashboard. The goal is to help you scan the newest materialized records first,
              then drill into vote detail when you need more depth.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-6 py-6">
            <p className="document-kicker">Ground Rules</p>
            <h2 className="document-title mt-3 text-3xl font-semibold text-foreground">What stays true</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Official-source facts first.</li>
              <li>Show newest materialized votes first.</li>
              <li>Show missing context explicitly when the record is thin.</li>
              <li>Keep the landing page focused on vote summaries and recorded tallies.</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

export default About

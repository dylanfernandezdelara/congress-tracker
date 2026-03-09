import { useEffect } from 'react'

function About() {
  useEffect(() => {
    document.title = 'About | Senate Pulse'
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-[28px] border border-stone-200/80 bg-[linear-gradient(145deg,rgba(255,253,248,0.96),rgba(245,238,226,0.96))] px-6 py-6 shadow-[0_18px_50px_rgba(59,45,35,0.08)] sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-700">About Senate Pulse</p>
        <h1 className="mt-3 max-w-2xl font-serif text-3xl tracking-tight text-stone-950 sm:text-4xl">
          Neutral context for the Senate votes that matter most.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600 sm:text-base">
          Senate Pulse is a public-interest briefing that ranks recent U.S. Senate votes and explains
          what happened, why it mattered, and who broke party lines.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <article className="rounded-3xl border border-stone-200 bg-white/90 p-6 shadow-[0_18px_40px_rgba(59,45,35,0.06)]">
          <h2 className="font-serif text-2xl text-stone-950">What the site is trying to do</h2>
          <p className="mt-4 text-sm leading-7 text-stone-700 sm:text-base">
            The project combines official sources including Congress.gov, Senate.gov, and GovInfo
            with transparent processing so readers can quickly see which votes were consequential,
            where parties split, and when a result fits into a broader historical pattern.
          </p>
          <p className="mt-4 text-sm leading-7 text-stone-700 sm:text-base">
            It is intentionally designed as a ranked briefing rather than a dense dashboard. The goal
            is to help you understand the most relevant Senate action first, then drill into vote
            detail when you need more depth.
          </p>
        </article>

        <article className="rounded-3xl border border-stone-200 bg-white/90 p-6 shadow-[0_18px_40px_rgba(59,45,35,0.06)]">
          <h2 className="font-serif text-2xl text-stone-950">Ground rules</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-700">
            <li>Official-source facts first.</li>
            <li>Explain rankings instead of hiding them.</li>
            <li>Show missing context explicitly when the record is thin.</li>
            <li>Keep the landing page focused on the votes worth attention now.</li>
          </ul>
        </article>
      </section>
    </div>
  )
}

export default About

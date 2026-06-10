import { fetchFeed } from '../api/client'
import type { FeedItem } from '../api/types'
import { FeedCard } from '../components/FeedCard'
import { useAsyncData } from '../hooks/useAsyncData'

export default function Home() {
  const { data, error, isLoading } = useAsyncData<FeedItem[]>({
    deps: [],
    load: fetchFeed,
    mapError: () => 'Could not load the bill feed. The worker may still be ingesting data.',
  })

  return (
    <main className="space-y-8">
      <header className="garden-header">
        <pre className="garden-welcome" aria-hidden="true">
          <code>Welcome!</code>
        </pre>
        <p className="garden-meta garden-meta-accent">Recent passage votes</p>
        <h1 className="document-title text-4xl text-heading">Congress Tracker</h1>
        <p className="garden-prose max-w-xl text-base text-body">
          Bills that received an official floor roll-call vote, rewritten in plain English. Flip any
          card to read the official CRS summary.
        </p>
      </header>

      <hr className="garden-divider" aria-hidden="true" />

      {isLoading ? (
        <p className="garden-meta normal-case tracking-normal">Loading feed…</p>
      ) : null}

      {error ? <p className="text-sm font-medium text-accent">{error}</p> : null}

      {!isLoading && !error && data?.length === 0 ? (
        <p className="garden-prose text-sm text-body/80">
          No recent passage votes in the lookback window yet. Run the ingestion pipeline to populate
          the feed.
        </p>
      ) : null}

      <section className="feed-list space-y-8">
        {data?.map((item) => (
          <FeedCard key={`${item.bill.congress}-${item.bill.type}-${item.bill.number}`} item={item} />
        ))}
      </section>

      <footer className="garden-footer">
        <p>Flip cards for official CRS summaries. Links open on congress.gov ↗</p>
      </footer>
    </main>
  )
}

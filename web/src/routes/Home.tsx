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
    <main className="space-y-10">
      <header className="header-band space-y-3 pb-8">
        <p className="kicker text-xs font-semibold uppercase tracking-[0.24em] text-accent">Recent passage votes</p>
        <h1 className="document-title text-4xl font-semibold text-heading">Congress Tracker</h1>
        <p className="max-w-xl text-base text-body">
          Bills that received an official floor roll-call vote, rewritten in plain English. Flip any
          card to read the official CRS summary.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading feed…</p>
      ) : null}

      {error ? <p className="text-sm text-accent">{error}</p> : null}

      {!isLoading && !error && data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recent passage votes in the lookback window yet. Run the ingestion pipeline to populate
          the feed.
        </p>
      ) : null}

      <section className="feed-list space-y-12">
        {data?.map((item) => (
          <FeedCard key={`${item.bill.congress}-${item.bill.type}-${item.bill.number}`} item={item} />
        ))}
      </section>
    </main>
  )
}

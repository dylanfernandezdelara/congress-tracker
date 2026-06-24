import { partyCssClass, partyDisplayName } from '@congress-tracker/shared/party'

import type { ChamberComposition, SessionStatsResponse } from '../api/types'
import { sortPartySeatCounts } from '../utils/chamberWedge'
import { ChamberPartyWedge } from './ChamberPartyWedge'
import { PresidentControlCard } from './PresidentControlCard'

type ChamberCardProps = {
  chamber: 'House' | 'Senate'
  composition: ChamberComposition
}

function ChamberCard({ chamber, composition }: ChamberCardProps) {
  const sortedSeats = sortPartySeatCounts(composition.seats)

  return (
    <article className="chamber-card">
      <header className="chamber-card-header">
        <h3 className="chamber-card-title">
          {chamber}
          {composition.is_sample ? (
            <span className="chamber-sample-badge"> · Sample roster</span>
          ) : null}
        </h3>
      </header>
      <ChamberPartyWedge chamber={chamber} seats={composition.seats} total={composition.total} />
      {composition.total > 0 ? (
        <footer className="chamber-card-footer">
          <ul
            className="chamber-seat-legend"
            aria-label={`${chamber} party seat counts`}
          >
            {sortedSeats.map((entry) => (
              <li key={entry.party} className="chamber-legend-item">
                <span
                  className={`chamber-legend-dot ${partyCssClass(entry.party)}`}
                  aria-hidden="true"
                />
                <span
                  className="chamber-legend-text"
                  title={`${partyDisplayName(entry.party)} ${entry.seats.toLocaleString()}`}
                >
                  {partyDisplayName(entry.party)} {entry.seats.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </article>
  )
}

type ChamberCompositionOverviewProps = {
  composition: SessionStatsResponse['composition'] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

export function ChamberCompositionOverview({
  composition,
  loading = false,
  error = null,
  onRetry,
}: ChamberCompositionOverviewProps) {
  if (error) {
    return (
      <section className="home-enrichment" aria-label="Federal Control">
        <p className="home-enrichment-error text-sm text-secondary">{error}</p>
        {onRetry ? (
          <button type="button" className="ghost-button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </section>
    )
  }

  if (loading && !composition) {
    return (
      <section className="home-enrichment" aria-label="Federal Control">
        <div className="chamber-overview-skeleton" aria-hidden="true" />
      </section>
    )
  }

  if (!composition) return null

  return (
    <section className="home-enrichment" aria-label="Federal Control">
      <div className="home-enrichment-header">
        <h2 className="home-enrichment-title">Federal Control</h2>
      </div>
      <div className="chamber-overview-grid">
        <ChamberCard chamber="House" composition={composition.house} />
        <ChamberCard chamber="Senate" composition={composition.senate} />
        <PresidentControlCard />
      </div>
    </section>
  )
}

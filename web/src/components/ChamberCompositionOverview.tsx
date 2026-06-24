import { lazy, Suspense } from 'react'
import { seatsUpElectionLabel } from '@congress-tracker/shared/chamber-election'
import { partyCssClass, partyDisplayName } from '@congress-tracker/shared/party'

import type { ChamberComposition, SessionStatsResponse } from '../api/types'
import { seatArcAriaLabel } from '../utils/chamberSeatLayout'
import { useChamberDiagramMode } from '../hooks/useChamberDiagramMode'
import { ChamberSeatArc2D } from './ChamberSeatArc2D'

const ChamberSeatDiagram3D = lazy(async () => {
  const mod = await import('./ChamberSeatDiagram3D')
  return { default: mod.ChamberSeatDiagram3D }
})

type ChamberSeatViewProps = {
  chamber: 'House' | 'Senate'
  composition: ChamberComposition
}

function ChamberSeatView({ chamber, composition }: ChamberSeatViewProps) {
  const mode = useChamberDiagramMode()
  const ariaLabel = seatArcAriaLabel(chamber, composition.seats, composition.total)

  if (composition.total === 0) {
    return <ChamberSeatArc2D chamber={chamber} seats={[]} total={0} />
  }

  if (mode === '2d') {
    return <ChamberSeatArc2D chamber={chamber} seats={composition.seats} total={composition.total} />
  }

  return (
    <Suspense fallback={<ChamberSeatArc2D chamber={chamber} seats={composition.seats} total={composition.total} />}>
      <ChamberSeatDiagram3D chamber={chamber} seats={composition.seats} ariaLabel={ariaLabel} />
    </Suspense>
  )
}

type ChamberCardProps = {
  chamber: 'House' | 'Senate'
  composition: ChamberComposition
}

function ChamberCard({ chamber, composition }: ChamberCardProps) {
  const electionLabel =
    composition.seats_up_for_election > 0
      ? seatsUpElectionLabel(chamber, composition.seats_up_for_election, composition.election_year)
      : null

  return (
    <article className="chamber-card">
      <header className="chamber-card-header">
        <h3 className="chamber-card-title">{chamber}</h3>
        <p className="chamber-card-control">
          {composition.control_label}
          {composition.is_sample ? (
            <span className="chamber-sample-badge"> · Sample roster</span>
          ) : null}
        </p>
      </header>
      <ChamberSeatView chamber={chamber} composition={composition} />
      {composition.total > 0 ? (
        <footer className="chamber-card-footer">
          {electionLabel ? (
            <p className="chamber-election-badge">{electionLabel}</p>
          ) : null}
          <ul className="chamber-seat-legend" aria-label={`${chamber} party seat counts`}>
            {composition.seats.map((entry) => (
              <li key={entry.party}>
                <span className={`chamber-party-pill ${partyCssClass(entry.party)}`}>
                  <span className="chamber-party-pill-label">
                    {partyDisplayName(entry.party)}
                  </span>
                  <span className="chamber-party-pill-count">{entry.seats.toLocaleString()}</span>
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
      <section className="home-enrichment" aria-label="Chamber control">
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
      <section className="home-enrichment" aria-label="Chamber control">
        <div className="chamber-overview-skeleton" aria-hidden="true" />
      </section>
    )
  }

  if (!composition) return null

  const hasSampleData = composition.house.is_sample || composition.senate.is_sample

  return (
    <section className="home-enrichment" aria-label="Chamber control">
      <div className="home-enrichment-header">
        <h2 className="home-enrichment-title">Chamber control</h2>
        <p className="home-enrichment-subtitle">
          {hasSampleData
            ? 'Party seat counts from local sample roster'
            : 'Current party seat counts from latest roll-call roster'}
        </p>
      </div>
      <div className="chamber-overview-grid">
        <ChamberCard chamber="House" composition={composition.house} />
        <ChamberCard chamber="Senate" composition={composition.senate} />
      </div>
    </section>
  )
}

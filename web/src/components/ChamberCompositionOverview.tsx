import { lazy, Suspense } from 'react'
import { partyCssClass, partyDisplayName } from '@congress-tracker/shared/party'

import type { ChamberComposition, SessionStatsResponse } from '../api/types'
import { seatArcAriaLabel } from '../utils/chamberSeatLayout'
import { useChamberDiagramMode } from '../hooks/useChamberDiagramMode'
import { ChamberSeatAmphitheater2D } from './ChamberSeatAmphitheater2D'

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
  const hasMemberSeatParties =
    Boolean(composition.seat_parties) &&
    composition.seat_parties!.length === composition.total
  const ariaLabel = seatArcAriaLabel(chamber, composition.seats, composition.total, {
    perMember: hasMemberSeatParties,
  })

  const seatProps = {
    chamber,
    seats: composition.seats,
    total: composition.total,
    seatParties: composition.seat_parties,
  }

  if (composition.total === 0) {
    return <ChamberSeatAmphitheater2D {...seatProps} seats={[]} total={0} />
  }

  if (mode === '3d') {
    return (
      <Suspense fallback={<ChamberSeatAmphitheater2D {...seatProps} />}>
        <ChamberSeatDiagram3D
          chamber={chamber}
          seats={composition.seats}
          seatParties={composition.seat_parties}
          ariaLabel={ariaLabel}
        />
      </Suspense>
    )
  }

  return <ChamberSeatAmphitheater2D {...seatProps} />
}

type ChamberCardProps = {
  chamber: 'House' | 'Senate'
  composition: ChamberComposition
}

function ChamberCard({ chamber, composition }: ChamberCardProps) {
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

  return (
    <section className="home-enrichment" aria-label="Chamber control">
      <div className="home-enrichment-header">
        <h2 className="home-enrichment-title">Chamber control</h2>
      </div>
      <div className="chamber-overview-grid">
        <ChamberCard chamber="House" composition={composition.house} />
        <ChamberCard chamber="Senate" composition={composition.senate} />
      </div>
    </section>
  )
}

import { countBallotSeatsByParty, buildSeatOnBallotFlags } from '@congress-tracker/shared/chamber-seat-ballot'
import { seatsUpElectionLabel } from '@congress-tracker/shared/chamber-election'
import { partyCssClass, partyDisplayName } from '@congress-tracker/shared/party'

import type { ChamberComposition, SessionStatsResponse } from '../api/types'
import { expandPartyCountsToSeats } from '../utils/chamberSeatLayout'
import { ChamberSeatGrid } from './ChamberSeatGrid'

type ChamberSeatViewProps = {
  chamber: 'House' | 'Senate'
  composition: ChamberComposition
}

function resolveSeatOnBallot(
  chamber: 'House' | 'Senate',
  composition: ChamberComposition
): boolean[] | null {
  if (composition.seat_on_ballot && composition.seat_on_ballot.length === composition.total) {
    return composition.seat_on_ballot
  }

  const seatParties =
    composition.seat_parties && composition.seat_parties.length === composition.total
      ? composition.seat_parties
      : expandPartyCountsToSeats(composition.seats)

  if (seatParties.length === 0) return null

  return buildSeatOnBallotFlags(
    chamber,
    seatParties,
    composition.seats_up_for_election
  )
}

function ChamberSeatView({ chamber, composition }: ChamberSeatViewProps) {
  const seatOnBallot = resolveSeatOnBallot(chamber, composition)

  return (
    <ChamberSeatGrid
      chamber={chamber}
      seats={composition.seats}
      total={composition.total}
      seatParties={composition.seat_parties}
      seatOnBallot={seatOnBallot}
      electionYear={composition.election_year}
    />
  )
}

type ChamberCardProps = {
  chamber: 'House' | 'Senate'
  composition: ChamberComposition
}

function ChamberCard({ chamber, composition }: ChamberCardProps) {
  const electionLabel =
    composition.is_sample
      ? `${composition.total.toLocaleString()} sample ${chamber === 'House' ? 'seats' : 'seats'} in local roster`
      : composition.seats_up_for_election > 0
        ? seatsUpElectionLabel(chamber, composition.seats_up_for_election, composition.election_year)
        : null

  const seatParties =
    composition.seat_parties && composition.seat_parties.length === composition.total
      ? composition.seat_parties
      : expandPartyCountsToSeats(composition.seats)
  const seatOnBallot = resolveSeatOnBallot(chamber, composition)
  const ballotByParty =
    chamber === 'House' && !composition.is_sample
      ? new Map(composition.seats.map((entry) => [entry.party, entry.seats]))
      : seatOnBallot && seatParties.length === seatOnBallot.length
        ? countBallotSeatsByParty(seatParties, seatOnBallot)
        : new Map<string, number>()

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
            {composition.seats.map((entry) => {
              const onBallot = ballotByParty.get(entry.party) ?? 0
              return (
                <li key={entry.party}>
                  <span className={`chamber-party-pill ${partyCssClass(entry.party)}`}>
                    <span className="chamber-party-pill-label">
                      {partyDisplayName(entry.party)}
                    </span>
                    <span className="chamber-party-pill-count">{entry.seats.toLocaleString()}</span>
                    {onBallot > 0 ? (
                      <span className="chamber-party-pill-ballot">
                        {onBallot.toLocaleString()} on {composition.election_year} ballot
                      </span>
                    ) : null}
                  </span>
                </li>
              )
            })}
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

  const subtitle = hasSampleData
    ? 'Party blocks sized by seat count — pulsing tiles mark Senate seats on this year’s ballot (sample roster).'
    : 'Party blocks sized by seat count — pulsing tiles mark Senate seats on this year’s ballot. The full House is elected every two years.'

  return (
    <section className="home-enrichment" aria-label="Chamber control">
      <div className="home-enrichment-header">
        <h2 className="home-enrichment-title">Chamber control</h2>
        <p className="home-enrichment-subtitle">{subtitle}</p>
      </div>
      <div className="chamber-overview-grid">
        <ChamberCard chamber="House" composition={composition.house} />
        <ChamberCard chamber="Senate" composition={composition.senate} />
      </div>
    </section>
  )
}

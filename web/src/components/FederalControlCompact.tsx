import { partyCssClass, partyDisplayName, partyShortLabel } from '@congress-tracker/shared/party'

import type { ChamberComposition, SessionStatsResponse } from '../api/types'
import { sortPartySeatCounts } from '../utils/chamberSeats'
import { CURRENT_PRESIDENT } from '../constants/president'

type FederalControlCompactProps = {
  composition: SessionStatsResponse['composition'] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

function formatSeatLine(composition: ChamberComposition): string {
  return sortPartySeatCounts(composition.seats)
    .map((entry) => `${partyShortLabel(entry.party)} ${entry.seats}`)
    .join(' · ')
}

function SeatBar({ composition }: { composition: ChamberComposition }) {
  const sorted = sortPartySeatCounts(composition.seats)
  const total = composition.total || sorted.reduce((sum, s) => sum + s.seats, 0)
  if (total <= 0) return null

  return (
    <div className="federal-compact-bar" aria-hidden="true">
      {sorted.map((entry) => (
        <span
          key={entry.party}
          className={`federal-compact-bar-seg ${partyCssClass(entry.party)}`}
          style={{ flex: entry.seats }}
        />
      ))}
    </div>
  )
}

function ChamberRow({
  chamber,
  composition,
}: {
  chamber: 'House' | 'Senate'
  composition: ChamberComposition
}) {
  const sorted = sortPartySeatCounts(composition.seats)
  const seatLine = formatSeatLine(composition)
  const control =
    composition.control_label ||
    (composition.majority_party
      ? `${partyDisplayName(composition.majority_party)} control`
      : 'No clear majority')

  return (
    <li className="federal-compact-row" aria-label={`${chamber}: ${control}. ${seatLine}`}>
      <div className="federal-compact-row-head">
        <span className="federal-compact-label">{chamber}</span>
        <p className="federal-compact-seats">
          {sorted.map((entry, index) => (
            <span key={entry.party}>
              {index > 0 ? ' · ' : ''}
              <span className={partyCssClass(entry.party)}>
                {partyShortLabel(entry.party)} {entry.seats}
              </span>
            </span>
          ))}
        </p>
      </div>
      <SeatBar composition={composition} />
    </li>
  )
}

export function FederalControlCompact({
  composition,
  loading = false,
  error = null,
  onRetry,
}: FederalControlCompactProps) {
  if (error) {
    return (
      <section className="federal-compact" aria-label="Federal Control">
        <p className="text-[13px] text-secondary">{error}</p>
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
      <section className="federal-compact" aria-label="Federal Control">
        <p className="text-[12px] text-faint">Loading control…</p>
      </section>
    )
  }

  if (!composition) return null

  const presidentParty = partyShortLabel(CURRENT_PRESIDENT.party)
  const presidentPartyName = partyDisplayName(CURRENT_PRESIDENT.party)

  return (
    <section className="federal-compact" aria-label="Federal Control">
      <h2 className="federal-compact-title">Federal Control</h2>
      <ul className="federal-compact-list">
        <ChamberRow chamber="House" composition={composition.house} />
        <ChamberRow chamber="Senate" composition={composition.senate} />
        <li
          className="federal-compact-row federal-compact-row--president"
          aria-label={`President: ${CURRENT_PRESIDENT.name}, ${presidentPartyName}`}
        >
          <div className="federal-compact-row-head">
            <span className="federal-compact-label">President</span>
            <p className="federal-compact-president">
              <span className="federal-compact-president-name">{CURRENT_PRESIDENT.name}</span>
              <span className={`federal-compact-president-party ${partyCssClass(CURRENT_PRESIDENT.party)}`}>
                {presidentParty}
              </span>
            </p>
          </div>
        </li>
      </ul>
    </section>
  )
}

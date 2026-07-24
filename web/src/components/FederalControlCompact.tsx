import { partyCssClass, partyDisplayName, partyShortLabel } from '@congress-tracker/shared/party'

import type { ChamberComposition, SessionStatsResponse } from '../api/types'
import { sortPartySeatCounts } from '../utils/chamberWedge'
import { CURRENT_PRESIDENT } from '../constants/president'

type FederalControlCompactProps = {
  composition: SessionStatsResponse['composition'] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
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

function ChamberCompact({
  chamber,
  composition,
}: {
  chamber: 'House' | 'Senate'
  composition: ChamberComposition
}) {
  const sorted = sortPartySeatCounts(composition.seats)
  const majority = composition.majority_party
    ? partyDisplayName(composition.majority_party)
    : null

  return (
    <div className="federal-compact-chamber">
      <div className="federal-compact-chamber-head">
        <span className="federal-compact-chamber-name">{chamber}</span>
        {majority ? (
          <span className="federal-compact-majority">{majority}</span>
        ) : null}
      </div>
      <SeatBar composition={composition} />
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

  return (
    <section className="federal-compact" aria-label="Federal Control">
      <h2 className="federal-compact-title">Federal Control</h2>
      <ChamberCompact chamber="House" composition={composition.house} />
      <ChamberCompact chamber="Senate" composition={composition.senate} />
      <div className="federal-compact-chamber">
        <div className="federal-compact-chamber-head">
          <span className="federal-compact-chamber-name">President</span>
          <span className="federal-compact-majority">
            {partyDisplayName(CURRENT_PRESIDENT.party)}
          </span>
        </div>
        <p className="federal-compact-seats federal-compact-president">
          {CURRENT_PRESIDENT.name}
        </p>
      </div>
    </section>
  )
}

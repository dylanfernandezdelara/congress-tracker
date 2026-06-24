import { partyCssClass } from '@congress-tracker/shared/party'

import type { PartySeatCount } from '../api/types'
import {
  chamberArcViewBox,
  layoutHemicycleDots,
  seatArcAriaLabel,
} from '../utils/chamberSeatLayout'

type ChamberSeatArc2DProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  total: number
  seatParties?: string[] | null
}

export function ChamberSeatArc2D({ chamber, seats, total, seatParties }: ChamberSeatArc2DProps) {
  if (total === 0) {
    return (
      <div className="chamber-seat-arc chamber-seat-arc--empty" aria-hidden="true">
        <span className="chamber-seat-arc-empty">Member roster not loaded yet</span>
      </div>
    )
  }

  const viewBox = chamberArcViewBox(chamber)
  const dots = layoutHemicycleDots(chamber, seats, seatParties)
  const chamberClass =
    chamber === 'House' ? 'chamber-seat-arc--house' : 'chamber-seat-arc--senate'

  return (
    <div className={`chamber-seat-arc-wrap ${chamberClass}`}>
      <svg
        className={`chamber-seat-arc ${chamberClass}`}
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label={seatArcAriaLabel(chamber, seats, total)}
        preserveAspectRatio="xMidYMax meet"
      >
        {dots.map((dot, index) => (
          <circle
            key={`${dot.party}-${index}`}
            cx={dot.x}
            cy={dot.y}
            r={dot.r}
            className={`chamber-seat-dot ${partyCssClass(dot.party)}`}
          />
        ))}
      </svg>
    </div>
  )
}

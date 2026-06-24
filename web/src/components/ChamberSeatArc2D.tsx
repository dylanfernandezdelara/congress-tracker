import { partyCssClass } from '@congress-tracker/shared/party'

import type { PartySeatCount } from '../api/types'
import {
  chamberArcSeatSize,
  chamberArcViewBox,
  layoutHemicycleSeatsFromCounts,
  seatArcAriaLabel,
} from '../utils/chamberSeatLayout'

type ChamberSeatArc2DProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  total: number
}

function ChairShape({
  x,
  y,
  size,
  party,
  faceDeg,
}: {
  x: number
  y: number
  size: number
  party: string
  faceDeg: number
}) {
  const seatW = size * 1.14
  const seatH = size * 0.46
  const backW = size * 0.38
  const backH = size * 1.02
  const className = `chamber-seat-cell ${partyCssClass(party)}`

  return (
    <g transform={`translate(${x}, ${y}) rotate(${faceDeg})`}>
      <rect
        x={-seatW / 2}
        y={0}
        width={seatW}
        height={seatH}
        rx={0.2}
        className={className}
      />
      <rect
        x={-seatW / 2}
        y={-backH}
        width={backW}
        height={backH}
        rx={0.2}
        className={className}
      />
    </g>
  )
}

export function ChamberSeatArc2D({ chamber, seats, total }: ChamberSeatArc2DProps) {
  if (total === 0) {
    return (
      <div className="chamber-seat-arc chamber-seat-arc--empty" aria-hidden="true">
        <span className="chamber-seat-arc-empty">Member roster not loaded yet</span>
      </div>
    )
  }

  const seatSize = chamberArcSeatSize(chamber)
  const viewBox = chamberArcViewBox(chamber)
  const cells = layoutHemicycleSeatsFromCounts(chamber, seats)

  return (
    <div className="chamber-seat-arc-wrap">
      <svg
        className="chamber-seat-arc"
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label={seatArcAriaLabel(chamber, seats, total)}
        preserveAspectRatio="xMidYMid meet"
      >
        {cells.map((cell, index) => (
          <ChairShape
            key={`${cell.party}-${index}`}
            x={cell.x}
            y={cell.y}
            size={seatSize}
            party={cell.party}
            faceDeg={cell.faceDeg}
          />
        ))}
      </svg>
    </div>
  )
}

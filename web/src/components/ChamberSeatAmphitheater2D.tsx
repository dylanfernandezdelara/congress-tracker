import { partyCssClass } from '@congress-tracker/shared/party'

import type { PartySeatCount } from '../api/types'
import {
  chamberArcViewBox,
  layoutAmphitheaterSeats2D,
  seatArcAriaLabel,
} from '../utils/chamberSeatLayout'

type ChamberSeatAmphitheater2DProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  total: number
  seatParties?: string[] | null
}

function IsoSeatShape({
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
  const seatW = size * 1.2
  const seatH = size * 0.5
  const backW = size * 0.42
  const backH = size * 1.05
  const className = `chamber-seat-cell ${partyCssClass(party)}`

  return (
    <g transform={`translate(${x}, ${y}) rotate(${faceDeg})`}>
      <rect x={-seatW / 2} y={0} width={seatW} height={seatH} rx={0.15} className={className} />
      <rect x={-seatW / 2} y={-backH} width={backW} height={backH} rx={0.15} className={className} />
    </g>
  )
}

export function ChamberSeatAmphitheater2D({
  chamber,
  seats,
  total,
  seatParties,
}: ChamberSeatAmphitheater2DProps) {
  if (total === 0) {
    return (
      <div className="chamber-amphitheater chamber-amphitheater--empty" aria-hidden="true">
        <span className="chamber-amphitheater-empty">Member roster not loaded yet</span>
      </div>
    )
  }

  const viewBox = chamberArcViewBox(chamber)
  const cells = layoutAmphitheaterSeats2D(chamber, seats, seatParties)
  const hasMemberSeatParties = Boolean(seatParties) && seatParties!.length === total
  const chamberClass =
    chamber === 'House' ? 'chamber-amphitheater--house' : 'chamber-amphitheater--senate'

  return (
    <div className={`chamber-amphitheater-wrap ${chamberClass}`}>
      <svg
        className={`chamber-amphitheater ${chamberClass}`}
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label={seatArcAriaLabel(chamber, seats, total, { perMember: hasMemberSeatParties })}
        preserveAspectRatio="xMidYMid meet"
      >
        {cells.map((cell, index) => (
          <IsoSeatShape
            key={`${cell.party}-${index}`}
            x={cell.x}
            y={cell.y}
            size={cell.size}
            party={cell.party}
            faceDeg={cell.faceDeg}
          />
        ))}
      </svg>
    </div>
  )
}

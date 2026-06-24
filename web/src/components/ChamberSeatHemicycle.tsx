import { Hemicycle } from '@hemicycle/react'
import { useMemo } from 'react'

import type { PartySeatCount } from '../api/types'
import { useDocumentTheme } from '../hooks/useDocumentTheme'
import { buildChamberHemicycle, getChamberHemicycleConfig } from '../utils/chamberHemicycle'
import { seatArcAriaLabel } from '../utils/chamberSeatLayout'

type ChamberSeatHemicycleProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  total: number
  seatParties?: string[] | null
}

export function ChamberSeatHemicycle({
  chamber,
  seats,
  total,
  seatParties,
}: ChamberSeatHemicycleProps) {
  const theme = useDocumentTheme()
  const hasMemberSeatParties = Boolean(seatParties) && seatParties!.length === total
  const ariaLabel = seatArcAriaLabel(chamber, seats, total, { perMember: hasMemberSeatParties })

  const { config, hemicycleData } = useMemo(() => {
    if (total <= 0) {
      return { config: getChamberHemicycleConfig(chamber), hemicycleData: [] }
    }
    const built = buildChamberHemicycle(chamber, seats, seatParties, theme)
    return {
      config: built.config,
      hemicycleData: built.seats.map((seat) => ({
        idx: seat.idx,
        party: seat.party,
        seatConfig: {
          shape: 'circle' as const,
          radius: built.config.seatRadius,
          color: seat.color,
        },
      })),
    }
  }, [chamber, seats, seatParties, theme, total])

  if (total === 0) {
    return (
      <div className="chamber-hemicycle chamber-hemicycle--empty" aria-hidden="true">
        <span className="chamber-hemicycle-empty">Member roster not loaded yet</span>
      </div>
    )
  }

  const chamberClass =
    chamber === 'House' ? 'chamber-hemicycle--house' : 'chamber-hemicycle--senate'

  return (
    <div className={`chamber-hemicycle-wrap ${chamberClass}`}>
      <Hemicycle
        rows={config.rows}
        totalSeats={total}
        innerRadius={config.innerRadius}
        outerRadius={config.outerRadius}
        totalAngle={180}
        seatMargin={config.seatMargin}
        width={config.width}
        height={config.height}
        orderBy="row"
        data={hemicycleData}
        seatConfig={{ shape: 'circle', radius: config.seatRadius }}
        hideEmptySeats
        svgProps={{
          className: `chamber-hemicycle ${chamberClass}`,
          role: 'img',
          'aria-label': ariaLabel,
          preserveAspectRatio: 'xMidYMax meet',
        }}
      />
    </div>
  )
}

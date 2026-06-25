import { useMemo } from 'react'

import type { PartySeatCount } from '../api/types'
import { useDocumentTheme } from '../hooks/useDocumentTheme'
import { partySeatColor } from '../utils/chamberPartyColors'
import {
  buildVisualWedgeSegments,
  wedgeArcPath,
  wedgeAriaLabel,
} from '../utils/chamberWedge'

const WEDGE_WIDTH = 280
const WEDGE_HEIGHT = 118
const INNER_R = 28
const OUTER_R = WEDGE_HEIGHT - 18
const CX = WEDGE_WIDTH / 2
const CY = WEDGE_HEIGHT - 6

function wedgeCountLabelColor(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? '#141414' : '#ffffff'
}

function wedgeCountFontSize(segment: { seats: number; visuallyEnlarged: boolean }): number {
  if (segment.visuallyEnlarged) return 15
  if (segment.seats > 99) return 14
  return 16
}

type ChamberPartyWedgeProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  total: number
}

export function ChamberPartyWedge({ chamber, seats, total }: ChamberPartyWedgeProps) {
  const theme = useDocumentTheme()
  const wedges = useMemo(
    () => (total > 0 ? buildVisualWedgeSegments(seats, total) : []),
    [seats, total]
  )

  if (total === 0) {
    return (
      <div className="chamber-wedge chamber-wedge--empty" aria-hidden="true">
        <span className="chamber-wedge-empty">Member roster not loaded yet</span>
      </div>
    )
  }

  return (
    <div className="chamber-wedge-wrap">
      <svg
        className="chamber-wedge"
        viewBox={`0 0 ${WEDGE_WIDTH} ${WEDGE_HEIGHT}`}
        role="img"
        aria-label={wedgeAriaLabel(chamber, seats, total)}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        {wedges.map((segment) => (
          <path
            key={segment.party}
            d={wedgeArcPath(segment.start, segment.end, CX, CY, INNER_R, OUTER_R)}
            fill={partySeatColor(segment.party, theme)}
            opacity={0.9}
          />
        ))}
        {wedges.map((segment) => {
          const labelR = (INNER_R + OUTER_R) / 2
          const lx = CX + labelR * Math.cos(segment.mid)
          const ly = CY + labelR * Math.sin(segment.mid)
          const fontSize = wedgeCountFontSize(segment)
          return (
            <text
              key={`${segment.party}-count`}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={wedgeCountLabelColor(theme)}
              fontSize={fontSize}
              fontWeight={600}
            >
              {segment.seats}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

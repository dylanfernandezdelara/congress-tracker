import { useCallback, useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { ArcSenator } from '../ui/homeViewModel'

interface Props {
  senators: ArcSenator[]
}

interface TooltipState {
  x: number
  y: number
  senator: ArcSenator
}

const ROWS = [20, 22, 24, 26, 28]
const BASE_RADIUS = 100
const ROW_GAP = 24
const DOT_RADIUS = 7

function computeSeats(senators: ArcSenator[]) {
  const seats: { senator: ArcSenator; cx: number; cy: number }[] = []
  let idx = 0
  const total = senators.length

  for (let row = 0; row < ROWS.length && idx < total; row++) {
    const r = BASE_RADIUS + row * ROW_GAP
    const count = Math.min(ROWS[row], total - idx)
    for (let i = 0; i < count; i++) {
      const angle = Math.PI - (Math.PI * (i + 0.5)) / count
      seats.push({
        senator: senators[idx],
        cx: r * Math.cos(angle),
        cy: -r * Math.sin(angle),
      })
      idx++
    }
  }
  return seats
}

export default function ChamberArc({ senators }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const seats = computeSeats(senators)

  const draw = useCallback(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const g = svg.append('g')

    seats.forEach(({ senator, cx, cy }) => {
      const rate = senator.attendanceRate
      const isGhost = rate === 0

      if (isGhost) {
        g.append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', DOT_RADIUS)
          .attr('fill', 'none')
          .attr('stroke', senator.color)
          .attr('stroke-width', 1.5)
          .attr('stroke-opacity', 0.4)
          .attr('stroke-dasharray', '2,2')
          .attr('data-bioguide', senator.bioguideId)
          .style('cursor', 'default')
      } else {
        g.append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', DOT_RADIUS)
          .attr('fill', senator.color)
          .attr('fill-opacity', 0.15 + rate * 0.85)
          .attr('stroke', 'none')
          .attr('data-bioguide', senator.bioguideId)
          .style('cursor', 'default')
      }
    })
  }, [seats])

  useEffect(() => { draw() }, [draw])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const target = e.target as SVGElement
      const bio = target.getAttribute('data-bioguide')
      if (!bio) { setTooltip(null); return }
      const senator = senators.find((s) => s.bioguideId === bio)
      if (!senator) { setTooltip(null); return }
      setTooltip({ x: e.clientX, y: e.clientY, senator })
    },
    [senators],
  )

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  const outerR = BASE_RADIUS + (ROWS.length - 1) * ROW_GAP + DOT_RADIUS + 4
  const viewBox = `${-outerR - 8} ${-outerR - 8} ${(outerR + 8) * 2} ${outerR + 20}`

  return (
    <div className="chamberArc">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {tooltip && (
        <div
          className="chamberArc__tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <strong>{tooltip.senator.name}</strong>
          <span>
            {tooltip.senator.party}-{tooltip.senator.state}
            {' · '}{tooltip.senator.votesCast}/{tooltip.senator.totalVotes} votes
            {tooltip.senator.attendanceRate < 1 && (
              <> · <span style={{ color: '#f59e0b' }}>
                missed {tooltip.senator.totalVotes - tooltip.senator.votesCast}
              </span></>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

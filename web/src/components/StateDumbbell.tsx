import { useCallback, useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { StatePairVM } from '../ui/homeViewModel'

interface Props {
  pairs: StatePairVM[]
}

interface TooltipState {
  x: number
  y: number
  pair: StatePairVM
}

const ROW_H = 18
const MARGIN = { top: 24, right: 24, bottom: 8, left: 42 }
const DOT_R = 4
const WIDTH = 700

export default function StateDumbbell({ pairs }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const innerW = WIDTH - MARGIN.left - MARGIN.right
    const totalH = MARGIN.top + pairs.length * ROW_H + MARGIN.bottom

    svg.attr('viewBox', `0 0 ${WIDTH} ${totalH}`)

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const x = d3.scaleLinear().domain([0, 100]).range([0, innerW])

    const ticks = [0, 25, 50, 75, 100]
    ticks.forEach((t) => {
      g.append('line')
        .attr('x1', x(t))
        .attr('x2', x(t))
        .attr('y1', -8)
        .attr('y2', pairs.length * ROW_H)
        .attr('stroke', '#e7e5e4')
        .attr('stroke-width', t === 50 ? 1 : 0.5)

      g.append('text')
        .attr('x', x(t))
        .attr('y', -12)
        .attr('text-anchor', 'middle')
        .attr('fill', '#78716c')
        .attr('font-size', 9)
        .text(`${t}%`)
    })

    pairs.forEach((pair, i) => {
      const cy = i * ROW_H + ROW_H / 2

      g.append('text')
        .attr('x', -6)
        .attr('y', cy)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#1c1917')
        .attr('font-size', 10)
        .attr('font-weight', 500)
        .text(pair.state)

      const x1 = x(pair.agreementPct)
      const x2 = x(100)

      g.append('line')
        .attr('x1', x1)
        .attr('x2', x2)
        .attr('y1', cy)
        .attr('y2', cy)
        .attr('stroke', pair.isMixedParty ? '#a8a29e' : '#e7e5e4')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')

      g.append('circle')
        .attr('cx', x(pair.agreementPct))
        .attr('cy', cy)
        .attr('r', DOT_R)
        .attr('fill', pair.senatorA.color)
        .attr('data-pair-idx', i)
        .style('cursor', 'default')

      if (pair.agreementPct < 100) {
        g.append('circle')
          .attr('cx', x(100))
          .attr('cy', cy)
          .attr('r', DOT_R)
          .attr('fill', pair.senatorB.color)
          .attr('data-pair-idx', i)
          .style('cursor', 'default')
      } else {
        g.append('circle')
          .attr('cx', x(100))
          .attr('cy', cy)
          .attr('r', DOT_R + 1)
          .attr('fill', pair.senatorA.color)
          .attr('data-pair-idx', i)
          .style('cursor', 'default')
      }

      if (pair.agreementPct < 50) {
        g.append('text')
          .attr('x', x(pair.agreementPct) + DOT_R + 4)
          .attr('y', cy)
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#78716c')
          .attr('font-size', 8)
          .text(`${pair.agreementPct}%`)
      }
    })
  }, [pairs])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const target = e.target as SVGElement
      const idx = target.getAttribute('data-pair-idx')
      if (idx === null) { setTooltip(null); return }
      const pair = pairs[Number(idx)]
      if (!pair) { setTooltip(null); return }
      setTooltip({ x: e.clientX, y: e.clientY, pair })
    },
    [pairs],
  )

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  return (
    <div className="stateDumbbell">
      <svg
        ref={svgRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {tooltip && (
        <div
          className="stateDumbbell__tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <strong>{tooltip.pair.state}</strong>
          <span>
            <span style={{ color: tooltip.pair.senatorA.color }}>{tooltip.pair.senatorA.name}</span>
            {' '}({tooltip.pair.senatorA.party})
          </span>
          <span>
            <span style={{ color: tooltip.pair.senatorB.color }}>{tooltip.pair.senatorB.name}</span>
            {' '}({tooltip.pair.senatorB.party})
          </span>
          <span>{tooltip.pair.agreementPct}% agreement</span>
        </div>
      )}
    </div>
  )
}

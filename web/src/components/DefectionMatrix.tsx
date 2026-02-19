import { useCallback, useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { DefectionMatrixVM } from '../ui/homeViewModel'

interface Props {
  matrix: DefectionMatrixVM
}

interface TooltipState {
  x: number
  y: number
  senatorName: string
  senatorParty: string
  voteTitle: string
  voteResult: string
  cast: string
  defection: boolean
}

const CELL = 14
const GAP = 2
const ROW_LABEL_W = 160
const COL_HEADER_H = 60
const COUNT_W = 32

export default function DefectionMatrix({ matrix }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const { rows, columns } = matrix
  const numCols = columns.length
  const numRows = rows.length

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const gridW = numCols * (CELL + GAP) - GAP
    const gridH = numRows * (CELL + GAP) - GAP
    const totalW = ROW_LABEL_W + COUNT_W + gridW
    const totalH = COL_HEADER_H + gridH

    svg.attr('viewBox', `0 0 ${totalW} ${totalH}`)

    const g = svg.append('g')

    columns.forEach((col, ci) => {
      const x = ROW_LABEL_W + COUNT_W + ci * (CELL + GAP) + CELL / 2
      const dateStr = col.date.slice(5).replace('-', '/')
      g.append('text')
        .attr('x', x)
        .attr('y', COL_HEADER_H - 6)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('transform', `rotate(-45, ${x}, ${COL_HEADER_H - 6})`)
        .attr('fill', '#78716c')
        .attr('font-size', 8)
        .text(dateStr)
    })

    rows.forEach((row, ri) => {
      const y = COL_HEADER_H + ri * (CELL + GAP)

      const lastName = row.name.split(',')[0]
      g.append('text')
        .attr('x', ROW_LABEL_W - 4)
        .attr('y', y + CELL / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#1c1917')
        .attr('font-size', 10)
        .attr('font-weight', 500)
        .text(lastName)

      g.append('circle')
        .attr('cx', ROW_LABEL_W + 4)
        .attr('cy', y + CELL / 2)
        .attr('r', 3)
        .attr('fill', row.color)

      g.append('text')
        .attr('x', ROW_LABEL_W + COUNT_W - 4)
        .attr('y', y + CELL / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#d97706')
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('font-family', "'JetBrains Mono', monospace")
        .text(row.totalDefections)

      row.cells.forEach((cell, ci) => {
        const x = ROW_LABEL_W + COUNT_W + ci * (CELL + GAP)

        if (cell.absent) return

        g.append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', CELL)
          .attr('height', CELL)
          .attr('rx', 2)
          .attr('fill', cell.defection ? '#d97706' : '#e7e5e4')
          .attr('fill-opacity', cell.defection ? 1 : 0.5)
          .attr('data-row', ri)
          .attr('data-col', ci)
          .style('cursor', 'default')
      })
    })
  }, [rows, columns, numCols, numRows])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const target = e.target as SVGElement
      const ri = target.getAttribute('data-row')
      const ci = target.getAttribute('data-col')
      if (ri === null || ci === null) { setTooltip(null); return }
      const row = rows[Number(ri)]
      const col = columns[Number(ci)]
      const cell = row.cells[Number(ci)]
      if (!row || !col || !cell) { setTooltip(null); return }

      setTooltip({
        x: e.clientX,
        y: e.clientY,
        senatorName: row.name,
        senatorParty: row.party,
        voteTitle: col.title,
        voteResult: col.result,
        cast: cell.cast,
        defection: cell.defection,
      })
    },
    [rows, columns],
  )

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  return (
    <div className="defectionMatrix">
      <div className="defectionMatrix__scroll">
        <svg
          ref={svgRef}
          className="defectionMatrix__svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>
      {tooltip && (
        <div
          className="defectionMatrix__tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <strong>{tooltip.senatorName} ({tooltip.senatorParty})</strong>
          <span>{tooltip.voteTitle}</span>
          <span>
            Voted: {tooltip.cast}
            {tooltip.defection && <> — <span style={{ color: '#fbbf24' }}>crossed party line</span></>}
          </span>
          <span style={{ color: '#a8a29e' }}>{tooltip.voteResult}</span>
        </div>
      )}
    </div>
  )
}

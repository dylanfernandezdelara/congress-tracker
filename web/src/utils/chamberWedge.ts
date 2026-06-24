import type { PartySeatCount } from '../api/types'
import type { PartyCode } from '@congress-tracker/shared/party'
import { normalizePartyCode } from '@congress-tracker/shared/party'

/** Min arc width (radians) — thin slivers are enlarged for readability. */
export const MIN_WEDGE_SWEEP = 0.12

export type WedgeSegment = {
  party: PartyCode
  seats: number
  sweep: number
  start: number
  end: number
  mid: number
  /** True when arc was widened above true seat proportion (small caucuses). */
  visuallyEnlarged: boolean
}

const PARTY_WEDGE_ORDER: PartyCode[] = ['D', 'I', 'R', 'Other']

export function sortPartySeatCounts(seats: PartySeatCount[]): PartySeatCount[] {
  const order = new Map(PARTY_WEDGE_ORDER.map((party, index) => [party, index]))
  return [...seats].sort((a, b) => {
    const ai = order.get(normalizePartyCode(a.party)) ?? 99
    const bi = order.get(normalizePartyCode(b.party)) ?? 99
    return ai - bi
  })
}

export function buildVisualWedgeSegments(
  seats: PartySeatCount[],
  total: number,
  minSweep = MIN_WEDGE_SWEEP
): WedgeSegment[] {
  if (total <= 0) return []

  const segments = sortPartySeatCounts(seats)
    .map((entry) => ({
      party: normalizePartyCode(entry.party),
      seats: entry.seats,
      proportional: (entry.seats / total) * Math.PI,
    }))
    .filter((entry) => entry.seats > 0)

  let deficit = 0
  const sweeps = segments.map((segment) => {
    if (segment.proportional < minSweep) {
      deficit += minSweep - segment.proportional
      return minSweep
    }
    return segment.proportional
  })

  const shrinkIndexes = segments
    .map((segment, index) => ({ index, sweep: sweeps[index] ?? 0, proportional: segment.proportional }))
    .filter((entry) => entry.proportional >= minSweep)

  const shrinkPool = shrinkIndexes.reduce((sum, entry) => sum + entry.sweep, 0)
  if (deficit > 0 && shrinkPool > 0) {
    for (const entry of shrinkIndexes) {
      const share = (entry.sweep / shrinkPool) * deficit
      sweeps[entry.index] = Math.max(entry.proportional * 0.92, (sweeps[entry.index] ?? 0) - share)
    }
  }

  const sweepSum = sweeps.reduce((sum, sweep) => sum + sweep, 0)
  const scale = sweepSum > 0 ? Math.PI / sweepSum : 1

  let startAngle = Math.PI
  return segments.map((segment, index) => {
    const sweep = (sweeps[index] ?? segment.proportional) * scale
    const start = startAngle
    const end = startAngle + sweep
    const mid = start + sweep / 2
    startAngle = end
    return {
      party: segment.party,
      seats: segment.seats,
      sweep,
      start,
      end,
      mid,
      visuallyEnlarged: segment.proportional < minSweep,
    }
  })
}

export function wedgeArcPath(
  start: number,
  end: number,
  cx: number,
  cy: number,
  innerR: number,
  outerR: number
): string {
  const x1o = cx + outerR * Math.cos(start)
  const y1o = cy + outerR * Math.sin(start)
  const x2o = cx + outerR * Math.cos(end)
  const y2o = cy + outerR * Math.sin(end)
  const x2i = cx + innerR * Math.cos(end)
  const y2i = cy + innerR * Math.sin(end)
  const x1i = cx + innerR * Math.cos(start)
  const y1i = cy + innerR * Math.sin(start)
  const large = end - start > Math.PI ? 1 : 0
  return `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${large} 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${innerR} ${innerR} 0 ${large} 0 ${x1i} ${y1i} Z`
}

export function wedgeAriaLabel(chamber: string, seats: PartySeatCount[], total: number): string {
  const breakdown = sortPartySeatCounts(seats)
    .map((entry) => `${entry.party} ${entry.seats}`)
    .join(', ')
  return `${chamber} seat composition: ${total} seats (${breakdown})`
}

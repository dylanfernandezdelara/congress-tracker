import { Hemicycle } from '@hemicycle/core'

import type { PartySeatCount } from '../api/types'
import { partySeatColor } from './chamberPartyColors'

export type ChamberKind = 'House' | 'Senate'

type HemicycleSeatLayout = ReturnType<Hemicycle['getSeatsLayout']>[number]

type HemicycleVisualConfig = {
  rows: number
  width: number
  height: number
  innerRadius: number
  outerRadius: number
  seatRadius: number
  seatMargin: number
}

const CONFIG: Record<ChamberKind, HemicycleVisualConfig> = {
  House: {
    rows: 14,
    width: 360,
    height: 168,
    innerRadius: 28,
    outerRadius: 88,
    seatRadius: 2.15,
    seatMargin: 0.35,
  },
  Senate: {
    rows: 7,
    width: 360,
    height: 168,
    innerRadius: 32,
    outerRadius: 92,
    seatRadius: 4.2,
    seatMargin: 0.55,
  },
}

export type ChamberHemicycleSeat = {
  idx: number
  party: string
  color: string
  layout: HemicycleSeatLayout
}

function partyCounts(seats: PartySeatCount[]): Record<string, number> {
  const counts: Record<string, number> = { D: 0, R: 0, I: 0, Other: 0 }
  for (const entry of seats) {
    if (entry.party in counts) counts[entry.party] += entry.seats
    else counts.Other += entry.seats
  }
  return counts
}

/** Assign D → left arc, R → right arc, I/Other → center — sorted by hemicycle x. */
function assignPartiesToLayout(
  layout: HemicycleSeatLayout[],
  seats: PartySeatCount[],
  seatParties?: string[] | null
): string[] {
  const total = seats.reduce((sum, entry) => sum + entry.seats, 0)
  if (seatParties && seatParties.length === total) {
    const sorted = [...layout].sort((a, b) => {
      if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex
      return a.x - b.x
    })
    const partyByIdx = new Map<number, string>()
    sorted.forEach((seat, index) => {
      partyByIdx.set(seat.idx, seatParties[index] ?? 'Other')
    })
    return layout.map((seat) => partyByIdx.get(seat.idx) ?? 'Other')
  }

  const counts = partyCounts(seats)
  const sorted = [...layout].sort((a, b) => a.x - b.x)
  const queue: string[] = [
    ...Array.from({ length: counts.D }, () => 'D'),
    ...Array.from({ length: counts.I }, () => 'I'),
    ...Array.from({ length: counts.Other }, () => 'Other'),
    ...Array.from({ length: counts.R }, () => 'R'),
  ]
  const partyByIdx = new Map<number, string>()
  sorted.forEach((seat, index) => {
    partyByIdx.set(seat.idx, queue[index] ?? 'Other')
  })
  return layout.map((seat) => partyByIdx.get(seat.idx) ?? 'Other')
}

export function getChamberHemicycleConfig(chamber: ChamberKind): HemicycleVisualConfig {
  return CONFIG[chamber]
}

export function buildChamberHemicycle(
  chamber: ChamberKind,
  seats: PartySeatCount[],
  seatParties?: string[] | null,
  theme: 'light' | 'dark' = 'light'
): { config: HemicycleVisualConfig; seats: ChamberHemicycleSeat[] } {
  const config = CONFIG[chamber]
  const total = seats.reduce((sum, entry) => sum + entry.seats, 0)
  if (total <= 0) {
    return { config, seats: [] }
  }
  const engine = new Hemicycle({
    rows: config.rows,
    totalSeats: total,
    innerRadius: config.innerRadius,
    outerRadius: config.outerRadius,
    totalAngle: 180,
    seatMargin: config.seatMargin,
    orderBy: 'row',
  })
  const layout = engine.getSeatsLayout()
  const parties = assignPartiesToLayout(layout, seats, seatParties)

  return {
    config,
    seats: layout.map((seat, index) => ({
      idx: seat.idx,
      party: parties[index] ?? 'Other',
      color: partySeatColor(parties[index] ?? 'Other', theme),
      layout: seat,
    })),
  }
}

export type Seat3DCell = {
  party: string
  x: number
  y: number
  z: number
  radius: number
}

/** Map hemicycle SVG coords to a compact 3D scene (opening faces the camera). */
export function hemicycleSeatsTo3D(
  chamber: ChamberKind,
  hemicycleSeats: ChamberHemicycleSeat[]
): Seat3DCell[] {
  const { seatRadius } = CONFIG[chamber]
  const unit = 0.011
  const tierLift = chamber === 'House' ? 0.018 : 0.028

  return hemicycleSeats.map(({ party, layout }) => ({
    party,
    x: layout.x * unit,
    y: layout.rowIndex * tierLift,
    z: layout.y * unit,
    radius: seatRadius * unit * (chamber === 'Senate' ? 1.35 : 0.95),
  }))
}

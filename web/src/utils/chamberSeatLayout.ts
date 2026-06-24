import type { PartySeatCount } from '../api/types'

export type SeatCell = {
  party: string
  /** Normalized X for 3D scene (-1.2 … 1.2). */
  x: number
  /** Seat tier height in 3D. */
  y: number
  /** Normalized Z depth (-1 … 0). */
  z: number
  /** Arc angle in radians (π = left, 0 = right). */
  angle: number
  /** Row index from inner (0) to outer. */
  rowIndex: number
}

export type HemicycleDot = {
  party: string
  x: number
  y: number
  r: number
}

const ROWS_BY_CHAMBER: Record<'House' | 'Senate', number> = {
  House: 14,
  Senate: 7,
}

const VIEWBOX_BY_CHAMBER: Record<'House' | 'Senate', { width: number; height: number }> = {
  House: { width: 420, height: 200 },
  Senate: { width: 420, height: 200 },
}

const SEAT_SIZE_BY_CHAMBER: Record<'House' | 'Senate', number> = {
  House: 2.8,
  Senate: 5.2,
}

function distributeToRows(total: number, rowCount: number): number[] {
  const base = Math.floor(total / rowCount)
  const remainder = total % rowCount
  return Array.from({ length: rowCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

function partyCounts(seats: PartySeatCount[]): Record<string, number> {
  const counts: Record<string, number> = { D: 0, R: 0, I: 0, Other: 0 }
  for (const entry of seats) {
    if (entry.party in counts) {
      counts[entry.party] += entry.seats
    } else {
      counts.Other += entry.seats
    }
  }
  return counts
}

/** One party code per occupied seat — from roster when available, else expanded counts. */
export function resolveSeatParties(
  seats: PartySeatCount[],
  seatParties?: string[] | null
): string[] {
  const total = seats.reduce((sum, entry) => sum + entry.seats, 0)
  if (seatParties && seatParties.length === total) {
    return seatParties
  }
  return expandPartyCountsToSeats(seats)
}

export function expandPartyCountsToSeats(seats: PartySeatCount[]): string[] {
  const expanded: string[] = []
  for (const entry of seats) {
    for (let i = 0; i < entry.seats; i += 1) {
      expanded.push(entry.party)
    }
  }
  return expanded
}

type RawPosition = Omit<SeatCell, 'party'>

function generateHemicyclePositions(chamber: 'House' | 'Senate', total: number): RawPosition[] {
  const rowCount = ROWS_BY_CHAMBER[chamber]
  const seatsPerRow = distributeToRows(total, rowCount)
  const positions: RawPosition[] = []

  for (let row = 0; row < rowCount; row += 1) {
    const count = seatsPerRow[row] ?? 0
    if (count === 0) continue

    const rowRadius = 0.72 + ((row + 1) / rowCount) * 0.28
    for (let col = 0; col < count; col += 1) {
      const t = count === 1 ? 0.5 : col / (count - 1)
      const angle = Math.PI * (1 - t)
      const rx = rowRadius * 0.98
      const rz = rowRadius * 0.94
      positions.push({
        x: rx * Math.cos(angle),
        y: row * 0.052 + 0.02,
        z: -rz * Math.sin(angle),
        angle,
        rowIndex: row,
      })
    }
  }

  return positions
}

/**
 * Classic horseshoe: Democrats on the left arc, Republicans on the right,
 * independents/other in the inner center — matching parliament-style diagrams.
 */
export function layoutHorseshoeSeats(
  chamber: 'House' | 'Senate',
  seats: PartySeatCount[],
  seatParties?: string[] | null
): SeatCell[] {
  const parties = resolveSeatParties(seats, seatParties)
  const total = parties.length
  if (total === 0) return []

  const counts = partyCounts(seats)
  const positions = generateHemicyclePositions(chamber, total)

  const centerSlots: RawPosition[] = []
  const leftSlots: RawPosition[] = []
  const rightSlots: RawPosition[] = []

  for (const pos of positions) {
    const isCenter = pos.rowIndex <= 1 && Math.abs(pos.angle - Math.PI / 2) < 0.42
    if (isCenter) {
      centerSlots.push(pos)
    } else if (pos.angle >= Math.PI / 2) {
      leftSlots.push(pos)
    } else {
      rightSlots.push(pos)
    }
  }

  leftSlots.sort((a, b) => b.angle - a.angle)
  rightSlots.sort((a, b) => b.angle - a.angle)
  centerSlots.sort((a, b) => a.rowIndex - b.rowIndex || b.angle - a.angle)

  const assigned: SeatCell[] = []
  const centerParties: string[] = [
    ...Array.from({ length: counts.I }, () => 'I'),
    ...Array.from({ length: counts.Other }, () => 'Other'),
  ]

  for (let i = 0; i < counts.D; i += 1) {
    const pos = leftSlots.shift() ?? centerSlots.shift()
    if (pos) assigned.push({ ...pos, party: 'D' })
  }

  for (const party of centerParties) {
    const pos = centerSlots.shift()
    if (pos) assigned.push({ ...pos, party })
  }

  for (let i = 0; i < counts.R; i += 1) {
    const pos = rightSlots.shift() ?? centerSlots.shift() ?? leftSlots.pop()
    if (pos) assigned.push({ ...pos, party: 'R' })
  }

  const leftovers = [...leftSlots, ...centerSlots, ...rightSlots]
  const partyQueue: string[] = []
  const assignedCounts = { D: 0, R: 0, I: 0, Other: 0 }
  for (const cell of assigned) {
    if (cell.party in assignedCounts) {
      assignedCounts[cell.party as keyof typeof assignedCounts] += 1
    } else {
      assignedCounts.Other += 1
    }
  }
  for (const party of ['D', 'R', 'I', 'Other'] as const) {
    const remaining = counts[party] - assignedCounts[party]
    for (let i = 0; i < remaining; i += 1) {
      partyQueue.push(party)
    }
  }
  leftovers.sort((a, b) => {
    const aScore = a.angle >= Math.PI / 2 ? Math.PI - a.angle : a.angle
    const bScore = b.angle >= Math.PI / 2 ? Math.PI - b.angle : b.angle
    return aScore - bScore
  })
  for (const pos of leftovers) {
    const party = partyQueue.shift()
    if (!party) break
    assigned.push({ ...pos, party })
  }

  if (seatParties && seatParties.length === total) {
    return applyRosterPartiesToLayout(assigned, parties)
  }

  return assigned
}

/**
 * When we have a real member roster, keep hemicycle positions but paint each
 * dot with that member's party. Layout is illustrative, not geographic.
 */
function applyRosterPartiesToLayout(cells: SeatCell[], rosterParties: string[]): SeatCell[] {
  const sorted = [...cells].sort((a, b) => {
    if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex
    return b.angle - a.angle
  })
  return sorted.map((cell, index) => ({
    ...cell,
    party: rosterParties[index] ?? cell.party,
  }))
}

export function layoutAmphitheaterSeats2D(
  chamber: 'House' | 'Senate',
  seats: PartySeatCount[],
  seatParties?: string[] | null
): Array<{ party: string; x: number; y: number; faceDeg: number; size: number }> {
  const { width, height } = VIEWBOX_BY_CHAMBER[chamber]
  const centerX = width / 2
  const centerY = height * 0.92
  const baseSize = SEAT_SIZE_BY_CHAMBER[chamber]
  const cells = layoutHorseshoeSeats(chamber, seats, seatParties)

  return cells.map((cell) => {
    const x = (cell.x + 1) * (width / 2)
    const y = centerY + cell.z * (height * 0.82)
    const faceDeg = (Math.atan2(centerY - y, centerX - x) * 180) / Math.PI
    const rowFactor = 1 - cell.rowIndex * 0.025
    return { party: cell.party, x, y, faceDeg, size: baseSize * rowFactor }
  })
}

export function layoutHemicycleDots(
  chamber: 'House' | 'Senate',
  seats: PartySeatCount[],
  seatParties?: string[] | null
): HemicycleDot[] {
  const { width, height } = VIEWBOX_BY_CHAMBER[chamber]
  const cells = layoutHorseshoeSeats(chamber, seats, seatParties)
  const total = cells.length
  const maxRow = Math.max(...cells.map((cell) => cell.rowIndex), 0) + 1
  const baseRadius = chamber === 'House' ? 2.35 : 3.1
  const rowScale = Math.max(0.72, 1 - maxRow * 0.018)

  return cells.map((cell) => {
    const x = (cell.x + 1) * (width / 2)
    const y = height + cell.z * (height * 0.94)
    const rowFactor = 1 - cell.rowIndex * 0.035
    const densityFactor = total > 200 ? 0.88 : total > 80 ? 0.94 : 1
    const r = baseRadius * rowFactor * rowScale * densityFactor
    return { party: cell.party, x, y, r }
  })
}

export function layoutHemicycleSeatsFromCounts(
  chamber: 'House' | 'Senate',
  seats: PartySeatCount[],
  seatParties?: string[] | null
): Array<{ party: string; x: number; y: number; faceDeg: number }> {
  const { width, height } = VIEWBOX_BY_CHAMBER[chamber]
  const centerX = width / 2
  const centerY = height
  return layoutHorseshoeSeats(chamber, seats, seatParties).map((cell) => {
    const x = (cell.x + 1) * (width / 2)
    const y = height + cell.z * height
    const faceDeg = (Math.atan2(centerY - y, centerX - x) * 180) / Math.PI
    return { party: cell.party, x, y, faceDeg }
  })
}

export function chamberArcViewBox(chamber: 'House' | 'Senate') {
  return VIEWBOX_BY_CHAMBER[chamber]
}

export function seatArcAriaLabel(
  chamber: string,
  seats: PartySeatCount[],
  total: number,
  options?: { perMember?: boolean }
): string {
  const breakdown = seats.map((entry) => `${entry.party} ${entry.seats}`).join(', ')
  if (options?.perMember) {
    return `${chamber} illustrative seating diagram: ${total} seats, each seat colored by member party (${breakdown})`
  }
  return `${chamber} illustrative seating diagram: ${total} seats colored by party totals (${breakdown})`
}

export function groupSeatsByParty(cells: SeatCell[]): Map<string, SeatCell[]> {
  const groups = new Map<string, SeatCell[]>()
  for (const cell of cells) {
    const list = groups.get(cell.party) ?? []
    list.push(cell)
    groups.set(cell.party, list)
  }
  return groups
}

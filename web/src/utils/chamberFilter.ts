export type ChamberFilter = 'House' | 'Senate'

export type ChamberFilterOption = 'All' | ChamberFilter

export function parseChamberFilter(value: string | null | undefined): ChamberFilter | null {
  if (value === 'House' || value === 'Senate') return value
  return null
}

export function chamberFilterLabel(chamber: ChamberFilter | null): string {
  return chamber ?? 'All'
}

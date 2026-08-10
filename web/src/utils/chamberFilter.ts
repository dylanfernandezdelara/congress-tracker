import { parseFeedChamberParam } from '@congress-tracker/shared/feed-filter-params'

export type ChamberFilter = 'House' | 'Senate'

export type ChamberFilterOption = 'All' | ChamberFilter

export function parseChamberFilter(value: string | null | undefined): ChamberFilter | null {
  return parseFeedChamberParam(value)
}

export function chamberFilterLabel(chamber: ChamberFilter | null): string {
  return chamber ?? 'All'
}

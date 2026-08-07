import { parseUsStateCode, usStateDisplayName } from '@congress-tracker/shared/us-states'

export type StateFilter = string

export function parseStateFilter(value: string | null | undefined): StateFilter | null {
  return parseUsStateCode(value)
}

export function stateFilterLabel(state: StateFilter | null): string {
  if (!state) return 'All states'
  return usStateDisplayName(state) ?? state
}

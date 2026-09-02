import type { FloorWorkStatus } from '@congress-tracker/shared/floor-quiet'

type ChamberChipStatus = { status: FloorWorkStatus | null }
type ChamberReturn = { status: FloorWorkStatus | null; returnsOn: string | null }

export const FLOOR_STATUS_LABEL = {
  working: 'Working',
  in_session: 'In session',
  in_recess: 'In recess',
} as const satisfies Record<FloorWorkStatus, string>

function chipStatusPhrase(status: FloorWorkStatus): string {
  return FLOOR_STATUS_LABEL[status].toLowerCase()
}

/**
 * Timeline chip next to “Chronological timeline”. Names each chamber so
 * “working” is never ambiguous about House vs Senate.
 */
export function floorChipLabel(house: ChamberChipStatus, senate: ChamberChipStatus): string | null {
  const houseStatus = house.status
  const senateStatus = senate.status
  if (houseStatus && senateStatus) {
    if (houseStatus === senateStatus) {
      return `House & Senate ${chipStatusPhrase(houseStatus)}`
    }
    return `House ${chipStatusPhrase(houseStatus)} · Senate ${chipStatusPhrase(senateStatus)}`
  }
  if (houseStatus) return `House ${chipStatusPhrase(houseStatus)}`
  if (senateStatus) return `Senate ${chipStatusPhrase(senateStatus)}`
  return null
}

export function chamberReturnCopy(
  detail: ChamberReturn,
  formatDay: (iso: string) => string,
): string | null {
  if (detail.status !== 'in_recess') return null
  if (!detail.returnsOn) return 'No published return date.'
  return `Back ${formatDay(detail.returnsOn)}`
}

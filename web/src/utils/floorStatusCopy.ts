import type { ChamberFloorDetail } from './feedQuiet'

function backPhrase(
  detail: Pick<ChamberFloorDetail, 'returnsOn'>,
  formatDay: (iso: string) => string,
): string | null {
  return detail.returnsOn ? formatDay(detail.returnsOn) : null
}

function statusPhrase(
  detail: Pick<ChamberFloorDetail, 'statusLabel'>,
): string {
  return detail.statusLabel?.toLowerCase() ?? 'not in recess'
}

/**
 * Plain-English answer to “are both chambers on recess, and do they return
 * together?” House and Senate publish separate calendars.
 */
export function floorStatusTogetherCopy(
  house: Pick<ChamberFloorDetail, 'status' | 'statusLabel' | 'returnsOn'>,
  senate: Pick<ChamberFloorDetail, 'status' | 'statusLabel' | 'returnsOn'>,
  formatDay: (iso: string) => string,
): string {
  const houseBack = backPhrase(house, formatDay)
  const senateBack = backPhrase(senate, formatDay)
  const houseRecess = house.status === 'in_recess'
  const senateRecess = senate.status === 'in_recess'

  if (houseRecess && senateRecess) {
    if (houseBack && senateBack && house.returnsOn === senate.returnsOn) {
      return `House and Senate are both in recess and are scheduled back ${houseBack}. They often share August and holiday breaks, but each chamber sets its own calendar.`
    }
    if (houseBack && senateBack) {
      return `House and Senate are both in recess, but they do not return together. The House is scheduled back ${houseBack}; the Senate stays out until ${senateBack}.`
    }
    if (houseBack) {
      return `House and Senate are both in recess. The House is scheduled back ${houseBack}. The Senate has not published a return date for this stretch.`
    }
    if (senateBack) {
      return `House and Senate are both in recess. The Senate is scheduled back ${senateBack}. The House has not published a return date for this stretch.`
    }
    return 'House and Senate are both in recess. Leadership has not published return dates for this stretch.'
  }

  if (houseRecess && !senateRecess) {
    const until = houseBack ? ` until ${houseBack}` : ''
    return `The House is in recess${until}. The Senate is ${statusPhrase(senate)}. They do not always recess at the same time.`
  }

  if (senateRecess && !houseRecess) {
    const until = senateBack ? ` until ${senateBack}` : ''
    return `The Senate is in recess${until}. The House is ${statusPhrase(house)}. They do not always recess at the same time.`
  }

  return 'House and Senate set separate floor calendars. They often recess together around August and holidays, but they do not always leave or return on the same day.'
}

export function chamberReturnCopy(
  detail: Pick<ChamberFloorDetail, 'status' | 'returnsOn'>,
  formatDay: (iso: string) => string,
): string | null {
  if (detail.status !== 'in_recess') return null
  if (!detail.returnsOn) {
    return 'Leadership has not published a return date for this stretch.'
  }
  return `Back ${formatDay(detail.returnsOn)}`
}

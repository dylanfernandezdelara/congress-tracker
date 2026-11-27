/** Ordering and labels for the 2026 guide, shared by the worker API and the web page. */

import { isCompetitiveRace, type ElectionRace, type StateElectionGuide } from './types'

const OFFICE_ORDER: Record<ElectionRace['office'], number> = { senate: 0, governor: 1, house: 2 }

/** Senate, then governor, then House by district; a special follows the regular race for its seat. */
export function compareRaces(a: ElectionRace, b: ElectionRace): number {
  return (
    OFFICE_ORDER[a.office] - OFFICE_ORDER[b.office] ||
    (a.district ?? 0) - (b.district ?? 0) ||
    Number(a.special) - Number(b.special)
  )
}

export interface GuideSections {
  /** Rated Toss-up or Lean by the cited forecaster. */
  competitive: ElectionRace[]
  /** Senate and governor races not in `competitive`. */
  statewide: ElectionRace[]
  /** House races not in `competitive`. */
  house: ElectionRace[]
}

export function guideSections(guide: StateElectionGuide): GuideSections {
  const sorted = [...guide.races].sort(compareRaces)
  return {
    competitive: sorted.filter(isCompetitiveRace),
    statewide: sorted.filter((r) => !isCompetitiveRace(r) && r.office !== 'house'),
    house: sorted.filter((r) => !isCompetitiveRace(r) && r.office === 'house'),
  }
}

/** "U.S. Senate", "U.S. Senate (special)", "Governor", "U.S. House · District 7", "U.S. House · At-large". */
export function raceTitle(race: ElectionRace): string {
  const special = race.special ? ' (special)' : ''
  if (race.office === 'senate') return `U.S. Senate${special}`
  if (race.office === 'governor') return 'Governor'
  const seat = race.district === 0 ? 'At-large' : `District ${race.district}`
  return `U.S. House · ${seat}${special}`
}

export function fecCandidateUrl(fecId: string): string {
  return `https://www.fec.gov/data/candidate/${encodeURIComponent(fecId)}/`
}

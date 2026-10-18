/**
 * 2026 general election guide data (election day 2026-11-03).
 *
 * Facts only: who is on the ballot, what office they hold now, and a cited
 * race rating. No positions, no endorsements. Rules for compiling a state
 * are in docs/MIDTERMS_2026.md.
 */

export const ELECTION_DAY_2026 = '2026-11-03'

export type ElectionOffice = 'senate' | 'house' | 'governor'

export interface ElectionSource {
  label: string
  url: string
  /** ISO day the fact was checked against this source. */
  checked: string
}

export type CandidatePartyCode = 'D' | 'R' | 'I' | 'L' | 'G' | 'Other'

export type CandidateBallotStatus = 'active' | 'withdrawn' | 'deceased'

export interface ElectionCandidate {
  /** Name as printed on the ballot. */
  name: string
  /** Sort key, last name first: "Van Drew, Jeff", "Luján Grisham, Michelle". */
  sort_name: string
  /** Every party line the candidate appears on, as the state prints them. Fusion states (NY, CT) can list several; the first is the main party. */
  parties: string[]
  /** Main party. */
  party_code: CandidatePartyCode
  /** Still printed on the ballot after withdrawing or dying: shown, not hidden. */
  ballot_status: CandidateBallotStatus
  /**
   * A sitting member of this office running for this seat. House: any sitting House member from
   * the state running in this district (after redistricting a district can have two, or none).
   */
  incumbent: boolean
  /** Sitting member of Congress (any seat) → links to their record on trackcongress. */
  bioguide_id: string | null
  /** Public office held now, e.g. "Pennsylvania State Treasurer". Null when none. */
  current_office: string | null
  /** FEC id for this race's office (H… for House, S… for Senate), e.g. "H8PA07150". Null for governor. */
  fec_candidate_id: string | null
  /** Official campaign site, linked as "Campaign site" and never quoted. */
  website: string | null
  sources: ElectionSource[]
}

export type RaceRatingLabel =
  | 'Toss-up'
  | 'Lean D'
  | 'Lean R'
  | 'Likely D'
  | 'Likely R'
  | 'Safe D'
  | 'Safe R'

export interface RaceRating {
  label: RaceRatingLabel
  /** ISO day Crystal Ball published or last changed this rating. */
  rated_on: string
  /** Sabato's Crystal Ball page the rating is on. */
  source: ElectionSource
}

export interface ElectionRace {
  /** `PA-H-07`, `AK-H-00` (at-large), `TX-H-18-SPECIAL`, `GA-S`, `OH-S-SPECIAL`, `PA-GOV`. */
  id: string
  state: string
  office: ElectionOffice
  /** House district; 0 for at-large; null for statewide races. */
  district: number | null
  /** Special election for the rest of a vacated term (a House special can share the ballot with the regular race for the same seat). */
  special: boolean
  /** No incumbent running for this seat. */
  open_seat: boolean
  rating: RaceRating | null
  /** Sorted by `sort_name`. Never by party or rating. */
  candidates: ElectionCandidate[]
  /** One factual line when the format is unusual, e.g. "Top-two general: both candidates are Democrats." */
  note: string | null
  sources: ElectionSource[]
}

export interface StateElectionGuide {
  state: string
  /** `pending` until every race in the state is compiled and checked. */
  status: 'pending' | 'compiled' | 'verified'
  /** State election office: official ballots, polling places, deadlines. */
  election_office: { name: string; url: string } | null
  /** Official "find your district" or sample-ballot lookup. */
  ballot_lookup_url: string | null
  races: ElectionRace[]
  /** ISO day of the last full pass over this state. */
  updated: string | null
}

const COMPETITIVE_RATINGS: ReadonlySet<RaceRatingLabel> = new Set(['Toss-up', 'Lean D', 'Lean R'])

/** The one rule for "competitive": rated Toss-up or Lean by the cited forecaster. */
export function isCompetitiveRace(race: ElectionRace): boolean {
  return race.rating != null && COMPETITIVE_RATINGS.has(race.rating.label)
}

export function pendingStateGuide(state: string): StateElectionGuide {
  return { state, status: 'pending', election_office: null, ballot_lookup_url: null, races: [], updated: null }
}

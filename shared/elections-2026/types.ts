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

export interface ElectionCandidate {
  name: string
  /** Party label as the state prints it ("Democratic", "Republican", "Independent", …). */
  party: string
  party_code: CandidatePartyCode
  /** Holds this exact seat now. */
  incumbent: boolean
  /** Sitting member of Congress (any seat) → links to their record on trackcongress. */
  bioguide_id: string | null
  /** Public office held now, e.g. "Pennsylvania State Treasurer". Null when none. */
  current_office: string | null
  /** FEC candidate id (federal races only), e.g. "H6PA07123". */
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
  /** Sabato's Crystal Ball; the source records the date of the rating. */
  source: ElectionSource
}

export interface ElectionRace {
  /** `PA-H-07`, `PA-H-00` (at-large), `GA-S`, `OH-S-SPECIAL`, `PA-GOV`. */
  id: string
  state: string
  office: ElectionOffice
  /** House district; 0 for at-large; null for statewide races. */
  district: number | null
  special: boolean
  /** No incumbent on the ballot for this seat. */
  open_seat: boolean
  rating: RaceRating | null
  /** Sorted by last name. Never by party or rating. */
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

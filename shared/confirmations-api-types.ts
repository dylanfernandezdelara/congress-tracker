/** Shared JSON contracts for /stats/recent-confirmations.json — worker + web. */

export interface ConfirmationBackgroundContent {
  headline: string
  what_was_confirmed: string
  /** Short person blurb (who they are), not a restatement of the confirmation. */
  background: string
  key_points: string[]
  /**
   * Wikipedia article URL when enrichment found a confident match.
   * `null` means looked up with no match; omit/undefined means not looked up yet.
   */
  wikipedia_url?: string | null
}

export interface ConfirmationNominee {
  display_name: string
  state: string | null
}

export interface RecentConfirmationItem {
  chamber: 'Senate'
  congress: number
  session: number
  roll_number: number
  citation: string
  nomination_number: number
  part_number: number
  nominee_names: ConfirmationNominee[]
  position_title: string | null
  organization: string | null
  description: string | null
  question: string
  result: string
  yeas: number
  nays: number
  vote_date: string
  headline: string | null
  what_was_confirmed: string | null
  /** Short person blurb shown when the row is expanded. */
  background: string | null
  key_points: string[]
  congress_gov_url: string
  /** Confident Wikipedia article for the nominee, when enrichment found one. */
  wikipedia_url: string | null
}

export interface RecentConfirmationsResponse {
  congress: number
  session: number
  confirmations: RecentConfirmationItem[]
  as_of: string
}

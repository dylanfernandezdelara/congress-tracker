/** Shared JSON contracts for /stats/recent-confirmations.json — worker + web. */

export interface ConfirmationBackgroundContent {
  headline: string
  what_was_confirmed: string
  background: string
  key_points: string[]
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
  background: string | null
  key_points: string[]
  congress_gov_url: string
}

export interface RecentConfirmationsResponse {
  congress: number
  session: number
  confirmations: RecentConfirmationItem[]
  as_of: string
}

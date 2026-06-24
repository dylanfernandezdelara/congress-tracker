/** Senate Class II states — on the ballot in 2026 (119th Congress). */

export const SENATE_CLASS_2_STATES = new Set([
  'AL',
  'AK',
  'AR',
  'CO',
  'DE',
  'GA',
  'ID',
  'IL',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MA',
  'MI',
  'MN',
  'MS',
  'MT',
  'NE',
  'NH',
  'NJ',
  'NM',
  'NC',
  'OK',
  'OR',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'VA',
  'WV',
  'WY',
])

export function isSenateClass2State(state: string | null | undefined): boolean {
  if (!state) return false
  return SENATE_CLASS_2_STATES.has(state.trim().toUpperCase())
}

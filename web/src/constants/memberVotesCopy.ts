/** Shared empty-state copy for per-roll party-defector UI. */
export const MEMBER_VOTES_UNAVAILABLE =
  'Per-member vote breakdown is not available for this roll call yet.'

export const MEMBER_VOTES_ERROR = 'Party defector data is temporarily unavailable.'

export function noPartyDefectorsMessage(chamber: string): string {
  return `No members broke with their party on this ${chamber} vote.`
}

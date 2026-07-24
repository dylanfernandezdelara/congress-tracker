/** Shared empty-state copy for per-roll party-defector UI. */
export const MEMBER_VOTES_UNAVAILABLE = 'Member-level votes not available yet.'

export const MEMBER_VOTES_ERROR = 'Party defector data is temporarily unavailable.'

export function noPartyDefectorsMessage(chamber: string): string {
  return `No members broke with their party on this ${chamber} vote.`
}

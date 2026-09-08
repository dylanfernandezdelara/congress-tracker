import { isLisMemberId } from '@congress-tracker/shared/member-id'

/** True when a member id can resolve via `/stats/member.json` (real bioguide or `LOCAL:` seed). */
export function canOpenMemberProfile(bioguideId: string | null | undefined): boolean {
  const id = bioguideId?.trim() ?? ''
  return id.length > 0 && !isLisMemberId(id)
}

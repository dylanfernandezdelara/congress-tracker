import { isRealBioguideId } from './member-id'

/** Standard bioguide.congress.gov headshot URL pattern. */
export function bioguidePhotoUrl(bioguideId: string): string | null {
  if (!isRealBioguideId(bioguideId)) return null
  const letter = bioguideId.charAt(0).toLowerCase()
  return `https://bioguide.congress.gov/bioguide/photo/${letter}/${bioguideId}.jpg`
}

/** Public Congress.gov member page, or null for non-bioguide identifiers. */
export function congressGovMemberUrl(bioguideId: string): string | null {
  if (!isRealBioguideId(bioguideId)) return null
  return `https://www.congress.gov/member/${bioguideId.toLowerCase()}`
}

export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase()
}

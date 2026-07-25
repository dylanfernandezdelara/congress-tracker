import { isRealBioguideId } from './member-id'

/** Standard bioguide.congress.gov headshot URL pattern. */
export function bioguidePhotoUrl(bioguideId: string): string | null {
  if (!isRealBioguideId(bioguideId)) return null
  const letter = bioguideId.charAt(0).toLowerCase()
  return `https://bioguide.congress.gov/bioguide/photo/${letter}/${bioguideId}.jpg`
}

/**
 * Slug for congress.gov `/member/{slug}/{bioguide}` paths.
 * Joins alphanumeric name tokens with hyphens. Bioguide is authoritative —
 * an imperfect slug still redirects to the right member page.
 */
export function memberNameSlug(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
  const parts = cleaned.split(/[^a-z0-9]+/).filter(Boolean)
  const filtered = parts.filter(
    (part) => !['jr', 'sr', 'ii', 'iii', 'iv', 'md', 'phd'].includes(part),
  )
  if (filtered.length === 0) return 'member'
  // Join all tokens so compound surnames (Ocasio-Cortez) stay in the path.
  // Bioguide is authoritative; an imperfect slug still redirects.
  return filtered.join('-')
}

/**
 * Public Congress.gov member page, or null for non-bioguide identifiers.
 * Format: `/member/{name-slug}/{BIOGUIDE}` — bioguide-only paths 404.
 */
export function congressGovMemberUrl(
  bioguideId: string,
  name?: string | null,
): string | null {
  if (!isRealBioguideId(bioguideId)) return null
  const slug = name?.trim() ? memberNameSlug(name) : 'member'
  return `https://www.congress.gov/member/${slug}/${bioguideId.toUpperCase()}`
}

export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase()
}

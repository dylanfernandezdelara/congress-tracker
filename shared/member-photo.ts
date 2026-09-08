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
  return filtered.join('-')
}

/**
 * Public Congress.gov member page, or null for non-bioguide identifiers.
 * Format: `/member/{name-slug}/{BIOGUIDE}` — bioguide-only paths 404.
 */
export function congressGovMemberUrl(bioguideId: string, name: string): string | null {
  if (!isRealBioguideId(bioguideId)) return null
  return `https://www.congress.gov/member/${memberNameSlug(name)}/${bioguideId.toUpperCase()}`
}

const LEADING_HONORIFIC = /^(?:res\.?\s*comm\.?|rep\.?|sen\.?|del\.?|mrs\.?|ms\.?|mr\.?|dr\.?)\s+/i
const BRACKETED_SUFFIX = /\s*[\[(][^\]\)]*[)\]]/g
const GENERATIONAL_SUFFIX = /^(?:jr\.?|sr\.?|ii|iii|iv)$/i

function firstInitial(token: string): string {
  const letter = token.charAt(0)
  return letter ? letter.toUpperCase() : ''
}

function stripNameDecorators(name: string): string {
  let cleaned = name.trim().replace(BRACKETED_SUFFIX, '').trim()
  let next = cleaned.replace(LEADING_HONORIFIC, '')
  while (next !== cleaned) {
    cleaned = next.trim()
    next = cleaned.replace(LEADING_HONORIFIC, '')
  }
  return cleaned
}

function significantTokens(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !GENERATIONAL_SUFFIX.test(token.replace(/,$/, '')))
}

export function memberInitials(name: string): string {
  const cleaned = stripNameDecorators(name)
  if (!cleaned) return '?'

  const comma = cleaned.indexOf(',')
  if (comma !== -1) {
    const lastTokens = significantTokens(cleaned.slice(0, comma))
    const firstTokens = significantTokens(cleaned.slice(comma + 1))
    const lastInitial = lastTokens[0] ? firstInitial(lastTokens[0]) : ''
    const firstInitialChar = firstTokens[0] ? firstInitial(firstTokens[0]) : ''
    const initials = `${firstInitialChar}${lastInitial}`
    return initials || '?'
  }

  const parts = significantTokens(cleaned)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return firstInitial(parts[0]!) || '?'
  return `${firstInitial(parts[0]!)}${firstInitial(parts[parts.length - 1]!)}`
}

import type { ConfirmationNominee } from './confirmations-api-types'

function formatOrganizationClause(org: string): string {
  if (/^(the|a|an)\s/i.test(org)) return ` at ${org}`
  if (
    /^(Department|Ministry|Office|Bureau|Agency|Commission|Board|Court|United States)\b/i.test(
      org,
    )
  ) {
    return ` at the ${org}`
  }
  return ` at ${org}`
}

/**
 * Honest official-sourced About line when we lack a rewritten blurb.
 * Uses Congress.gov nomination identity fields only — never invents biography.
 */
export function buildOfficialConfirmationAbout(params: {
  nominees: ConfirmationNominee[]
  positionTitle: string | null
  organization: string | null
  description: string | null
}): string | null {
  const name = params.nominees[0]?.display_name?.trim()
  const state = params.nominees[0]?.state?.trim() || null
  const role = params.positionTitle?.trim() || null
  const org = params.organization?.trim() || null

  if (name && role) {
    const from = state ? ` of ${state}` : ''
    const at =
      org && org.toLowerCase() !== role.toLowerCase() ? formatOrganizationClause(org) : ''
    return `${name}${from} was confirmed as ${role}${at}.`
  }
  if (name) {
    return `${name}${state ? ` of ${state}` : ''} was confirmed by the Senate.`
  }
  if (params.description?.trim()) {
    // Strip trailing local-sample markers; keep the official nomination sentence.
    return params.description
      .trim()
      .replace(/\s*\(local sample\)\s*$/i, '')
      .replace(/\s+/g, ' ')
  }
  if (role) {
    return `Confirmed as ${role}${org ? formatOrganizationClause(org) : ''}.`
  }
  return null
}

/** True when a Wikipedia extract adds substance beyond the official About line. */
export function wikipediaExtractAddsDetail(
  officialAbout: string | null,
  wikipediaExtract: string | null,
): boolean {
  const wiki = wikipediaExtract?.trim()
  if (!wiki) return false
  const official = officialAbout?.trim()
  if (!official) return true
  if (wiki === official) return false
  // Skip if wiki is basically a longer restatement of the same short official line.
  if (wiki.toLowerCase().includes(official.toLowerCase().replace(/\.$/, ''))) {
    return wiki.length > official.length + 40
  }
  return true
}

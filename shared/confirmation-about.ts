import type { ConfirmationNominee } from './confirmations-api-types'
import { normalizePartyCode, partyDisplayName, partyShortLabel } from './party'
import type { RollPartySplit } from './stats-api-types'

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

/** True when official About only restates the headline (name + role confirmed). */
export function isRedundantConfirmationAbout(about: string | null): boolean {
  const text = about?.trim()
  if (!text) return true
  // Identity scaffolding from Congress.gov fields — not person background.
  if (/\bwas confirmed as\b/i.test(text)) return true
  if (/\bwas confirmed by the Senate\b/i.test(text)) return true
  if (/^Confirmed as\b/i.test(text)) return true
  return false
}

/**
 * Choose the About blurb readers should see.
 * Prefer a person Wikipedia extract; skip official identity lines that only
 * repeat the card headline.
 */
export function selectConfirmationAbout(params: {
  officialAbout: string | null
  wikipediaExtract: string | null
}): { text: string | null; source: 'wikipedia' | 'official' | null } {
  const wiki = params.wikipediaExtract?.trim() || null
  if (wiki) return { text: wiki, source: 'wikipedia' }
  const official = params.officialAbout?.trim() || null
  if (official && !isRedundantConfirmationAbout(official)) {
    return { text: official, source: 'official' }
  }
  return { text: null, source: null }
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

function partyNounPlural(party: string): string {
  const code = normalizePartyCode(party)
  if (code === 'Other') return 'members'
  return `${partyDisplayName(code)}s`
}

/**
 * Honest opposition context from party splits — never invents policy reasons.
 * Returns null when every party majority supported confirmation (or no data).
 */
export function confirmationOppositionNote(splits: RollPartySplit[]): string | null {
  if (splits.length === 0) return null
  const opposing = splits
    .filter((split) => split.party_line === 'nay' && split.nays > 0)
    .sort((a, b) => b.nays - a.nays || a.party.localeCompare(b.party))
  const primary = opposing[0]
  if (!primary) return null

  const label = partyShortLabel(primary.party)
  const tally = `${label} ${primary.yeas}–${primary.nays}`
  const noun = partyNounPlural(primary.party)
  if (primary.yeas === 0) {
    return `${noun} voted against confirmation (${tally}).`
  }
  return `Most ${noun} voted against confirmation (${tally}).`
}

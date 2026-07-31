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

const PERSON_BIO_CUE =
  /\b(previously|served|led|leading|graduated|born|former|worked|director|commissioner|professor|attorney|judge|ambassador|executive|advisor|adviser)\b/i

function normalizeAboutText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Congress.gov nomination description style — names the office, not the person's
 * background ("Jane Doe, of California, to be Secretary of Energy, vice …").
 */
export function isNominationBoilerplateAbout(about: string | null): boolean {
  const text = about?.trim()
  if (!text) return false
  if (PERSON_BIO_CUE.test(text) && text.split(/(?<=[.!?])\s+/).filter(Boolean).length > 1) {
    return false
  }
  return /,\s*of\s+[^,]+,\s*to be\s+/i.test(text)
}

/** True when official About only restates the headline (name + role confirmed). */
export function isRedundantConfirmationAbout(about: string | null): boolean {
  const text = about?.trim()
  if (!text) return true
  if (isNominationBoilerplateAbout(text)) return true
  // Multi-sentence or bio-cue sentences still carry person facts.
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length > 1 || PERSON_BIO_CUE.test(text)) return false
  return (
    /\bwas confirmed as\b/i.test(text) ||
    /\bwas confirmed by the Senate\b/i.test(text) ||
    /^Confirmed as\b/i.test(text)
  )
}

/**
 * True when a stored/rewritten About is not a useful person blurb (empty,
 * restates the nomination description, or is identity/boilerplate only).
 */
export function isThinConfirmationBackground(
  about: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const text = about?.trim() ?? ''
  if (!text) return true
  const desc = description?.trim() ?? ''
  if (desc && normalizeAboutText(text) === normalizeAboutText(desc)) return true
  return isRedundantConfirmationAbout(text)
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

/** Card headline from stored rewrite or nomination identity. */
export function confirmationHeadline(params: {
  storedHeadline: string | null
  nominees: ConfirmationNominee[]
  positionTitle: string | null
  description: string | null
  citation: string
}): string {
  if (params.storedHeadline?.trim()) return params.storedHeadline.trim()
  const name = params.nominees[0]?.display_name?.trim()
  const role = params.positionTitle?.trim()
  if (name && role) return `${name} confirmed as ${role}`
  if (name) return `${name} confirmed`
  if (params.description?.trim()) return params.description.trim()
  return params.citation
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

  const tally = `${partyShortLabel(primary.party)} ${primary.yeas}–${primary.nays}`
  const noun = partyNounPlural(primary.party)
  return primary.yeas === 0
    ? `${noun} voted against confirmation (${tally}).`
    : `Most ${noun} voted against confirmation (${tally}).`
}

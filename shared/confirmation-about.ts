import type { ConfirmationNominee } from './confirmations-api-types'
import { FEED_LEAD_MAX_WORDS, splitSentences, truncateWords } from './digest-format'
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

/**
 * Career-history cues that mark a sentence as biography. Office titles
 * ("Director", "Judge", …) are deliberately excluded — identity lines like
 * "was confirmed as Director of X" name the office, not the person's past.
 */
const PERSON_BIO_CUE =
  /\b(previously|served|led|leading|graduated|born|former|worked|chaired)\b/i

/** Identity-only restatements of the card headline (confirmed or nominated). */
const IDENTITY_ONLY_PATTERNS = [
  /\bwas nominated (?:to serve )?(?:as|to be|for)\b/i,
  /\bwas confirmed as\b/i,
  /\bwas confirmed by the Senate\b/i,
  /^Confirmed as\b/i,
]

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
  if (PERSON_BIO_CUE.test(text) && splitSentences(text).length > 1) {
    return false
  }
  return /,\s*of\s+[^,]+,\s*to be\s+/i.test(text)
}

/** True when official About only restates the headline (name + role confirmed). */
export function isRedundantConfirmationAbout(about: string | null): boolean {
  const text = about?.trim()
  if (!text) return true
  if (isNominationBoilerplateAbout(text)) return true
  // Multi-sentence or career-cue blurbs still carry person facts.
  if (splitSentences(text).length > 1 || PERSON_BIO_CUE.test(text)) return false
  return IDENTITY_ONLY_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * True when text is an empty/echo of the Congress.gov nomination description
 * (including ", of State, to be Role" boilerplate). Used to reopen enrichment
 * write-paths — not every identity "was confirmed as" line.
 */
export function isNominationDescriptionEcho(
  about: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const text = about?.trim() ?? ''
  if (!text) return true
  const desc = description?.trim() ?? ''
  if (desc && normalizeAboutText(text) === normalizeAboutText(desc)) return true
  return isNominationBoilerplateAbout(text)
}

/**
 * True when a stored/rewritten About is not a useful person blurb (empty,
 * restates the nomination description, or is identity/boilerplate only).
 * Used by the read/UI path to hide non-person copy.
 */
export function isThinConfirmationBackground(
  about: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const text = about?.trim() ?? ''
  if (!text) return true
  if (isNominationDescriptionEcho(text, description)) return true
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

/**
 * Rewrites drafted from thin nomination-only source text sometimes mislabel a
 * confirmation as a nomination ("Jane Doe nominated as ..."). Every row here is
 * a confirmed Senate vote, so never surface nominated-only phrasing.
 */
export function isMisleadingConfirmationHeadline(headline: string): boolean {
  return /\bnominat/i.test(headline) && !/\bconfirm/i.test(headline)
}

/**
 * Wikipedia-style lede sentences that only introduce the person and the office
 * they now hold ("X is an American health official currently serving as
 * Director of the CDC") repeat what the card headline already says.
 */
const ROLE_RESTATEMENT = /\bserv(?:es|ing) as\b|\bwas (?:confirmed|sworn in|appointed) as\b/i

/** Truncated teasers should not end on a dangling connective ("… General from…"). */
const TRAILING_CONNECTIVE =
  /\s+(?:a|an|and|as|at|but|by|for|from|in|into|of|on|or|the|to|with)…$/i

function truncateTeaserSentence(sentence: string): string {
  let teaser = truncateWords(sentence, FEED_LEAD_MAX_WORDS)
  while (TRAILING_CONNECTIVE.test(teaser)) {
    teaser = teaser.replace(TRAILING_CONNECTIVE, '…')
  }
  return teaser
}

/**
 * Collapsed-row "who this is" teaser. Prefer the first career-history sentence
 * ("previously served as Deputy Surgeon General …") — that is the signal
 * readers need — over ledes that merely restate the office in the headline.
 * Never surface nominated-only phrasing; return null when nothing beyond the
 * headline remains.
 */
export function confirmationAboutTeaser(about: string | null): string | null {
  if (!about?.trim()) return null
  const sentences = splitSentences(about).filter(
    (candidate) => !isMisleadingConfirmationHeadline(candidate),
  )
  const pick =
    sentences.find((candidate) => PERSON_BIO_CUE.test(candidate)) ??
    sentences.find((candidate) => !ROLE_RESTATEMENT.test(candidate)) ??
    null
  return pick ? truncateTeaserSentence(pick) : null
}

/** Card headline from stored rewrite or nomination identity. */
export function confirmationHeadline(params: {
  storedHeadline: string | null
  nominees: ConfirmationNominee[]
  positionTitle: string | null
  description: string | null
  citation: string
}): string {
  const stored = params.storedHeadline?.trim()
  if (stored && !isMisleadingConfirmationHeadline(stored)) return stored
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

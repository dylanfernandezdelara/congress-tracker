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
 * Biographical cues for the redundancy/boilerplate checks. Office titles
 * ("Director", "Judge", …) are deliberately excluded — identity lines like
 * "was confirmed as Director of X" name the office, not the person's past.
 * Teaser preference uses the narrower CAREER_HISTORY_CUE instead.
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
 * Sentences that restate the office on the card: present-tense "serves as /
 * is serving as / currently serving as", present-perfect "has served as …
 * since", and the confirmation event itself ("was confirmed/sworn in as").
 * The "is … serving as" span must not jump a temporal or characterizing
 * marker — "who, after serving as ambassador, joined …" and "is best known
 * for serving as …" are career history — and allows "." so abbreviations
 * like "U.S." do not break the match. Past appointments ("was appointed as
 * ambassador in 2015") stay eligible as career history.
 * Tradeoff: a past confirmation to a different office is also skipped — a
 * second "confirmed as" line under a "confirmed as" headline reads as noise,
 * and the expanded About keeps the full text.
 */
const ROLE_RESTATEMENT =
  /\bserves as\b|\bis\b(?:(?!\b(?:after|before|prior|formerly|previously|known|for)\b)[^!?])*?\bserving as\b|\b(?:currently|now) serving as\b|\bhas served as\b[^!?]*?\bsince\b|\bwas (?:confirmed|sworn in) as\b/i

/**
 * Past-career markers for teaser preference. Narrower than PERSON_BIO_CUE on
 * purpose: "born"/"graduated" make a sentence biographical for redundancy
 * checks, but they are a weak collapsed teaser next to a profession lede.
 */
const CAREER_HISTORY_CUE =
  /\b(?:previously|formerly|former|earlier|before|after|prior|until)\b|\bserved as\b|\bwas appointed\b|\b(?:led|worked|chaired)\b/i

/** Birth/education facts read weak next to a profession lede; never prefer them. */
const BIRTH_EDUCATION = /\b(?:born|graduated)\b/i

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
 * Collapsed-row "who this is" teaser. Sentences that restate the office in the
 * headline (or mislabel the vote as a nomination) are excluded up front; among
 * the rest, prefer the first career-history sentence ("previously served as
 * Deputy Surgeon General …") — that is the signal readers need — then fall
 * back to the first remaining sentence (e.g. a profession lede). Return null
 * when nothing beyond the headline remains.
 */
export function confirmationAboutTeaser(about: string | null): string | null {
  if (!about?.trim()) return null
  const candidates = splitSentences(about).filter(
    (candidate) =>
      !isMisleadingConfirmationHeadline(candidate) && !ROLE_RESTATEMENT.test(candidate),
  )
  const pick =
    candidates.find(
      (candidate) => CAREER_HISTORY_CUE.test(candidate) && !BIRTH_EDUCATION.test(candidate),
    ) ??
    candidates[0] ??
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

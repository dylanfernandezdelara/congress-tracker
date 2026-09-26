/**
 * Model for the 1200×630 share card: headline on the left, the outcome on the
 * right with yes and no counts and a party-colored bar under each.
 * The worker renders it to PNG (`/og/bill/:id.png`); the web share sheet renders
 * an HTML twin so the preview matches what crawlers fetch.
 */
import { formatBillDocket, formatBillQueryParam, formatShortBillId, trimDisplayTitle } from './bill-id'
import { proceduralHeadline } from './procedural-titles'
import type { RollPartySplit } from './stats-api-types'

export const OG_CARD_WIDTH = 1200
export const OG_CARD_HEIGHT = 630
export const OG_CARD_SITE_LABEL = 'trackcongress.org'
export const OG_CARD_HEADLINE_MAX_CHARS = 140
/** Bump when the card's look changes, so link previews refetch every card. */
export const OG_CARD_DESIGN = 'scoreboard-1'

export interface OgCardTally {
  chamber: 'House' | 'Senate'
  yeas: number
  nays: number
  /** Present when member-level votes were ingested for the roll. */
  party_splits: RollPartySplit[]
}

/** What the card's right panel says happened. */
export type OgCardOutcome = 'passed' | 'failed' | 'law' | 'vetoed' | 'no_vote'

export interface OgCardModel {
  /** `H.R. 1`, shown beside the wordmark. */
  bill_label: string
  /** `H.R. 1 · 119th Congress`, for alt text. */
  docket: string
  /** Digest headline (or trimmed official title). */
  headline: string
  outcome: OgCardOutcome
  /** `Passed House`, `Failed Senate`, `Became law`, `Vetoed`, `In committee`. */
  outcome_label: string
  /** Enactment or veto date (`Jul 4, 2025`); null otherwise. */
  outcome_date: string | null
  /** One-line status for alt text: `Passed House 219–213 · Sep 3, 2026`. */
  status_line: string
  /** Yes and no counts with party splits; null unless the outcome is a vote. */
  tally: OgCardTally | null
  /** The vote needed two-thirds (suspension, veto override, constitutional amendment). */
  two_thirds: boolean
}

export type OgCardParty = 'D' | 'I' | 'Other' | 'R'

/** Left-to-right order of party segments inside each bar. */
export const OG_CARD_PARTY_ORDER: ReadonlyArray<OgCardParty> = ['D', 'I', 'Other', 'R']

/**
 * Party splits come from per-member roll rows, the tally from the roll header.
 * Only trust the split when both agree, otherwise a partially ingested roll
 * would draw a bar that contradicts the printed total.
 */
export function reconciledPartySplits(tally: OgCardTally): RollPartySplit[] {
  if (tally.party_splits.length === 0) return []
  let yeas = 0
  let nays = 0
  for (const split of tally.party_splits) {
    yeas += split.yeas
    nays += split.nays
  }
  return yeas === tally.yeas && nays === tally.nays ? tally.party_splits : []
}

function normalizeBarParty(party: string): OgCardParty {
  const code = party.trim().toUpperCase()
  if (code === 'D' || code === 'R' || code === 'I') return code
  return 'Other'
}

/**
 * One side's votes by party, in bar order. Without reconciled splits the side
 * is a single `Other` segment, drawn in the neutral color.
 */
export function ogCardSideSegments(
  tally: OgCardTally,
  side: 'yea' | 'nay',
): Array<{ party: OgCardParty; count: number }> {
  const total = side === 'yea' ? tally.yeas : tally.nays
  if (total <= 0) return []
  const splits = reconciledPartySplits(tally)
  if (splits.length === 0) return [{ party: 'Other', count: total }]
  const byParty = new Map<OgCardParty, number>()
  for (const split of splits) {
    const party = normalizeBarParty(split.party)
    byParty.set(party, (byParty.get(party) ?? 0) + (side === 'yea' ? split.yeas : split.nays))
  }
  return OG_CARD_PARTY_ORDER.filter((party) => (byParty.get(party) ?? 0) > 0).map((party) => ({
    party,
    count: byParty.get(party)!,
  }))
}

/**
 * Passage that needs two-thirds of those voting: House suspension votes, veto
 * overrides, and joint resolutions proposing a constitutional amendment.
 */
export function requiresTwoThirds(params: {
  question: string | null | undefined
  billType: string
  officialTitle: string | null | undefined
}): boolean {
  const question = params.question ?? ''
  if (/suspend the rules/i.test(question) || /overrid/i.test(question)) return true
  const type = params.billType.toUpperCase()
  return (
    (type === 'HJRES' || type === 'SJRES') &&
    /^\s*proposing an amendment to the constitution/i.test(params.officialTitle ?? '')
  )
}

export function truncateForCard(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  const cut = cleaned.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, '')}…`
}

export function formatTallyLabel(tally: Pick<OgCardTally, 'yeas' | 'nays'>): string {
  return `${tally.yeas}–${tally.nays}`
}

const CARD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2026-09-03…` → `Sep 3, 2026`; null for missing or non-ISO input. */
export function formatCardDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  const month = CARD_MONTHS[Number.parseInt(match[2]!, 10) - 1]
  if (!month) return null
  return `${month} ${Number.parseInt(match[3]!, 10)}, ${match[1]}`
}

export type OgCardStatusVote = {
  chamber: string
  /** Roll-call question, e.g. `On Motion to Suspend the Rules and Pass`. */
  question?: string | null
  yeas: number
  nays: number
  result: string
  vote_date: string | null
}

function passedVerb(result: string): 'Passed' | 'Failed' {
  return /fail|reject|not/i.test(result) ? 'Failed' : 'Passed'
}

/** Status copy: enactment wins, then the newest passage vote, then intro state. */
export function buildStatusLine(params: {
  latestVote: OgCardStatusVote | null
  becameLawDate: string | null
  vetoedDate: string | null
}): string {
  const law = formatCardDate(params.becameLawDate)
  if (law) return `Became law · ${law}`
  const vetoed = formatCardDate(params.vetoedDate)
  if (vetoed) return `Vetoed · ${vetoed}`
  const vote = params.latestVote
  if (vote) {
    const chamber = vote.chamber === 'Senate' ? 'Senate' : 'House'
    const date = formatCardDate(vote.vote_date)
    return `${passedVerb(vote.result)} ${chamber} ${formatTallyLabel(vote)}${date ? ` · ${date}` : ''}`
  }
  return 'Introduced · In committee'
}

export function ogCardDocket(bill: { congress: number; type: string; number: number }): string {
  return formatBillDocket(bill.type, bill.number, bill.congress)
}

/**
 * Card colors: dfdl's warm neutrals with saturated party colors, brighter than
 * the site's so the bars read at message-thumbnail size. Fixed light palette:
 * link cards ignore the site theme.
 */
export const OG_CARD_COLORS = {
  page: '#fffcf7',
  panel: '#f4efe7',
  track: '#e6e0d7',
  ink: '#090501',
  secondary: '#787165',
  tertiary: '#8c8579',
  law: '#a8680e',
  party: { D: '#0f62f0', I: '#8c4fd0', Other: '#787165', R: '#e21d2c' } satisfies Record<OgCardParty, string>,
} as const

export type OgCardAssembleInput = {
  bill: { congress: number; type: string; number: number }
  /** Digest headline when the bill has one. */
  digestHeadline: string | null | undefined
  /** Official bill title; fallback headline source. */
  officialTitle: string | null | undefined
  /** Newest passage vote on the bill, if any. */
  latestVote: OgCardStatusVote | null
  /** Per-party splits for `latestVote`; empty when not ingested. */
  partySplits: RollPartySplit[]
  becameLawDate: string | null | undefined
  vetoedDate: string | null | undefined
}

/**
 * Single card-assembly contract: the worker feeds it D1 rows, the web feeds it
 * feed items, and both produce the identical model (headline fallback order,
 * truncation, status copy, tally shape).
 */
export function assembleOgCardModel(input: OgCardAssembleInput): OgCardModel {
  const digestHeadline = input.digestHeadline?.trim() || null
  const officialTitle = input.officialTitle?.trim() || null
  const headlineSource =
    (digestHeadline ? trimDisplayTitle(digestHeadline) : null) ||
    (officialTitle ? proceduralHeadline(officialTitle) || trimDisplayTitle(officialTitle) : null) ||
    ogCardDocket(input.bill)
  const vote = input.latestVote
  const lawDate = formatCardDate(input.becameLawDate)
  const vetoDate = lawDate ? null : formatCardDate(input.vetoedDate)
  const chamber = vote?.chamber === 'Senate' ? 'Senate' : 'House'
  let outcome: OgCardOutcome
  let outcomeLabel: string
  if (lawDate) {
    outcome = 'law'
    outcomeLabel = 'Became law'
  } else if (vetoDate) {
    outcome = 'vetoed'
    outcomeLabel = 'Vetoed'
  } else if (vote) {
    outcome = passedVerb(vote.result) === 'Failed' ? 'failed' : 'passed'
    outcomeLabel = `${outcome === 'failed' ? 'Failed' : 'Passed'} ${chamber}`
  } else {
    outcome = 'no_vote'
    outcomeLabel = 'In committee'
  }
  const isVote = outcome === 'passed' || outcome === 'failed'
  return {
    bill_label: formatShortBillId(input.bill.type, input.bill.number),
    docket: ogCardDocket(input.bill),
    headline: truncateForCard(headlineSource, OG_CARD_HEADLINE_MAX_CHARS),
    outcome,
    outcome_label: outcomeLabel,
    outcome_date: lawDate ?? vetoDate,
    status_line: buildStatusLine({
      latestVote: vote,
      becameLawDate: input.becameLawDate ?? null,
      vetoedDate: input.vetoedDate ?? null,
    }),
    tally:
      isVote && vote
        ? { chamber, yeas: vote.yeas, nays: vote.nays, party_splits: input.partySplits }
        : null,
    two_thirds:
      isVote && vote
        ? requiresTwoThirds({ question: vote.question, billType: input.bill.type, officialTitle })
        : false,
  }
}

/**
 * Path (origin-relative) of the PNG for a bill. `v` is a content version so
 * social caches refetch when the card changes.
 */
export function ogCardImagePath(
  bill: { congress: number; type: string; number: number },
  options: { version: string },
): string {
  return `/og/bill/${formatBillQueryParam(bill)}.png?v=${options.version}`
}

/** Short, deterministic version token for `ogCardImagePath`. */
export function ogCardVersion(model: OgCardModel): string {
  const input = JSON.stringify([
    OG_CARD_DESIGN,
    model.headline,
    model.outcome_label,
    model.outcome_date,
    model.two_thirds,
    model.tally ? [model.tally.yeas, model.tally.nays, reconciledPartySplits(model.tally)] : null,
  ])
  // FNV-1a 32-bit: short, stable across worker + web, no crypto dependency.
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

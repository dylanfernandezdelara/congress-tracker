/**
 * Model for the 1200×630 "tally" share card (canvas option H4).
 * The worker renders it to PNG (`/og/bill/:id.png`); the web share sheet renders
 * an HTML twin so the preview matches what crawlers fetch.
 */
import { formatBillDocket, formatBillQueryParam } from './bill-id'
import type { RollPartySplit } from './stats-api-types'

export const OG_CARD_WIDTH = 1200
export const OG_CARD_HEIGHT = 630
export const OG_CARD_SITE_LABEL = 'trackcongress.org'
/** Longest quote the card will render before truncating with an ellipsis. */
export const OG_CARD_QUOTE_MAX_CHARS = 220
export const OG_CARD_HEADLINE_MAX_CHARS = 140

export interface OgCardTally {
  chamber: 'House' | 'Senate'
  yeas: number
  nays: number
  /** Present when member-level votes were ingested for the roll. */
  party_splits: RollPartySplit[]
}

export interface OgCardModel {
  /** `H.R. 1 · 119th Congress` */
  docket: string
  /** Digest headline (or trimmed official title) — main text when `quote` is null. */
  headline: string
  /** Verbatim shared quote; when present it becomes the main text. */
  quote: string | null
  /** `Passed House 219–213 · Sep 3, 2026`, `Became law · …`, `Introduced · In committee`. */
  status_line: string
  /** Party-split bar data; null for bills with no passage vote yet. */
  tally: OgCardTally | null
}

/** Order segments are drawn left → right: yea side by party, then nay side. */
export type OgCardBarSegment = {
  party: 'D' | 'R' | 'I' | 'Other'
  side: 'yea' | 'nay'
  count: number
}

const PARTY_ORDER: Array<OgCardBarSegment['party']> = ['D', 'I', 'Other', 'R']

/**
 * Bar segments for the tally. With party splits: D→I→Other→R yeas, then
 * R→Other→I→D nays so the two "outer" colors meet their own party's nays.
 * Without splits: a single yea segment and a single nay segment.
 */
export function ogCardBarSegments(tally: OgCardTally): OgCardBarSegment[] {
  const total = tally.yeas + tally.nays
  if (total <= 0) return []
  if (tally.party_splits.length === 0) {
    return [
      { party: 'Other', side: 'yea', count: tally.yeas },
      { party: 'Other', side: 'nay', count: tally.nays },
    ]
  }
  const byParty = new Map<OgCardBarSegment['party'], RollPartySplit>()
  for (const split of tally.party_splits) {
    const key = normalizeBarParty(split.party)
    const existing = byParty.get(key)
    byParty.set(
      key,
      existing
        ? { ...existing, yeas: existing.yeas + split.yeas, nays: existing.nays + split.nays }
        : { ...split, party: key },
    )
  }
  const yeas: OgCardBarSegment[] = []
  const nays: OgCardBarSegment[] = []
  for (const party of PARTY_ORDER) {
    const split = byParty.get(party)
    if (!split) continue
    if (split.yeas > 0) yeas.push({ party, side: 'yea', count: split.yeas })
    if (split.nays > 0) nays.push({ party, side: 'nay', count: split.nays })
  }
  return [...yeas, ...nays.reverse()]
}

function normalizeBarParty(party: string): OgCardBarSegment['party'] {
  const code = party.trim().toUpperCase()
  if (code === 'D' || code === 'R' || code === 'I') return code
  return 'Other'
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

export function ogCardDocket(bill: { congress: number; type: string; number: number }): string {
  return formatBillDocket(bill.type, bill.number, bill.congress)
}

/**
 * Path (origin-relative) of the PNG for a bill, optionally scoped to a quote.
 * `v` is a content version so social caches refetch when the card changes.
 */
export function ogCardImagePath(
  bill: { congress: number; type: string; number: number },
  options: { quoteId?: string | null; version: string },
): string {
  const params = new URLSearchParams()
  if (options.quoteId) params.set('q', options.quoteId)
  params.set('v', options.version)
  return `/og/bill/${formatBillQueryParam(bill)}.png?${params.toString()}`
}

/** Short, deterministic version token for `ogCardImagePath`. */
export function ogCardVersion(model: OgCardModel): string {
  const input = JSON.stringify([
    model.headline,
    model.quote,
    model.status_line,
    model.tally ? [model.tally.yeas, model.tally.nays, model.tally.party_splits.length] : null,
  ])
  // FNV-1a 32-bit: short, stable across worker + web, no crypto dependency.
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

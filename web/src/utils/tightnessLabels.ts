import { voteMargin } from '@congress-tracker/shared/vote-cohesion'
import { formatShortBillId } from '@congress-tracker/shared/feed-content'
import { voteIndicatesFailure } from '@congress-tracker/shared/vote-result'

import type { TightnessDot, VoteCohesion } from '../api/types'

export const HOUSE_MARGIN_CAP = 20
export const SENATE_MARGIN_CAP = 10
export const HOUSE_CLOSEST_LIMIT = 4
export const SENATE_CLOSEST_LIMIT = 3

export function tightnessDotKey(dot: TightnessDot): string {
  return `${dot.kind}:${dot.chamber}:${dot.congress}:${dot.session}:${dot.roll_number}`
}

export function cohesionLabel(cohesion: VoteCohesion): string {
  if (cohesion === 'party-line') return 'party-line'
  if (cohesion === 'bipartisan') return 'bipartisan'
  return 'party split unknown'
}

export function tightnessVoteFailed(dot: TightnessDot): boolean {
  if (dot.result?.trim()) return voteIndicatesFailure(dot.result)
  return dot.yeas < dot.nays
}

export function tightnessDotLabel(dot: TightnessDot): string {
  if (dot.kind === 'nominee') {
    return dot.nominee_name?.trim() || dot.headline?.trim() || 'Senate nominee'
  }
  if (dot.bill_type && dot.bill_number != null) {
    return formatShortBillId(dot.bill_type, dot.bill_number)
  }
  return dot.headline?.trim() || 'Bill'
}

/** Visible bar label: `H.Res. 1499 · 210–208` / `PN · Name · 58–40`. */
export function tightnessBarLabel(dot: TightnessDot): string {
  const tally = `${dot.yeas}–${dot.nays}`
  const failed = tightnessVoteFailed(dot) ? ' failed' : ''
  if (dot.kind === 'nominee') {
    const name = dot.nominee_name?.trim() || 'Senate nominee'
    return `PN · ${name} · ${tally}${failed}`
  }
  return `${tightnessDotLabel(dot)} · ${tally}${failed}`
}

export function tightnessDotAriaLabel(dot: TightnessDot): string {
  const kind = dot.kind === 'nominee' ? 'nominee' : 'bill'
  const failed = tightnessVoteFailed(dot) ? ', failed' : ''
  return `${dot.chamber} ${kind} ${tightnessDotLabel(dot)}, ${dot.yeas}–${dot.nays}, ${cohesionLabel(dot.cohesion)}${failed}`
}

/** Share of the chamber track. Scale is |yeas−nays|, never yea%. */
export function tightnessBarWidth(dot: TightnessDot, cap: number): number {
  if (cap <= 0) return 0
  return Math.min(voteMargin(dot.yeas, dot.nays), cap) / cap
}

export function compareClosestVotes(a: TightnessDot, b: TightnessDot): number {
  const margin = voteMargin(a.yeas, a.nays) - voteMargin(b.yeas, b.nays)
  if (margin !== 0) return margin
  return b.vote_date.localeCompare(a.vote_date) || a.roll_number - b.roll_number
}

/** Closest rolls first; drop the steamroll tail beyond the chamber cap. */
export function selectClosestVotes(
  dots: TightnessDot[],
  cap: number,
  limit: number,
): TightnessDot[] {
  return dots
    .filter((dot) => voteMargin(dot.yeas, dot.nays) <= cap)
    .sort(compareClosestVotes)
    .slice(0, limit)
}

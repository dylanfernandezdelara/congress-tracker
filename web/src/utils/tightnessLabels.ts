import {
  HOUSE_CLOSEST_LIMIT,
  HOUSE_MARGIN_CAP,
  SENATE_CLOSEST_LIMIT,
  SENATE_MARGIN_CAP,
  selectClosestVotes,
  voteMargin,
} from '@congress-tracker/shared/vote-cohesion'
import { formatShortBillId } from '@congress-tracker/shared/feed-content'
import { voteIndicatesFailure } from '@congress-tracker/shared/vote-result'

import type { TightnessDot, VoteCohesion } from '../api/types'

export {
  HOUSE_CLOSEST_LIMIT,
  HOUSE_MARGIN_CAP,
  SENATE_CLOSEST_LIMIT,
  SENATE_MARGIN_CAP,
  selectClosestVotes,
}

export function tightnessDotKey(dot: TightnessDot): string {
  return `${dot.kind}:${dot.chamber}:${dot.congress}:${dot.session}:${dot.roll_number}`
}

export function cohesionLabel(cohesion: VoteCohesion): string {
  if (cohesion === 'party-line') return 'party-line'
  if (cohesion === 'bipartisan') return 'bipartisan'
  return 'party split unknown'
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

/** First line of a closest-vote row: what was voted on, in words (headline or nominee), not a docket. */
export function tightnessBarTitle(dot: TightnessDot): string {
  if (dot.kind === 'nominee') {
    const name = dot.nominee_name?.trim() || 'Senate nominee'
    const position = dot.position_title?.trim()
    return position ? `${name}, ${position}` : name
  }
  return dot.headline?.trim() || tightnessDotLabel(dot)
}

/** Second line: `H.R. 88 · passed 210–208 · party-line` / `confirmed 58–40 · bipartisan`. */
export function tightnessBarMeta(dot: TightnessDot): string {
  const failed = voteIndicatesFailure(dot.result)
  const verb =
    dot.kind === 'nominee' ? (failed ? 'rejected' : 'confirmed') : failed ? 'failed' : 'passed'
  const parts = [`${verb} ${dot.yeas}–${dot.nays}`]
  if (dot.kind !== 'nominee' && dot.bill_type && dot.bill_number != null) {
    parts.unshift(formatShortBillId(dot.bill_type, dot.bill_number))
  }
  if (dot.cohesion !== 'unknown') parts.push(cohesionLabel(dot.cohesion))
  return parts.join(' · ')
}

export function tightnessDotAriaLabel(dot: TightnessDot): string {
  const kind = dot.kind === 'nominee' ? 'nominee' : 'bill'
  const failed = voteIndicatesFailure(dot.result) ? ', failed' : ''
  return `${dot.chamber} ${kind} ${tightnessDotLabel(dot)}, ${dot.yeas}–${dot.nays}, ${cohesionLabel(dot.cohesion)}${failed}`
}

/** Share of the chamber track. Scale is |yeas−nays|, never yea%. */
export function tightnessBarWidth(dot: TightnessDot, cap: number): number {
  if (cap <= 0) return 0
  return Math.min(voteMargin(dot.yeas, dot.nays), cap) / cap
}

import { tightnessAxisPosition } from '@congress-tracker/shared/vote-cohesion'
import { formatShortBillId } from '@congress-tracker/shared/feed-content'

import type { TightnessDot, VoteCohesion } from '../api/types'

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

export function tightnessDotAriaLabel(dot: TightnessDot): string {
  const kind = dot.kind === 'nominee' ? 'nominee' : 'bill'
  const pct =
    dot.yea_pct == null ? 'no yea share' : `${Math.round(dot.yea_pct * 100)}% yea`
  return `${dot.chamber} ${kind} ${tightnessDotLabel(dot)}, ${dot.yeas}–${dot.nays}, ${cohesionLabel(dot.cohesion)}, ${pct}`
}

export function tightnessDotLeftPercent(dot: TightnessDot): number {
  return tightnessAxisPosition(dot.yea_pct) * 100
}

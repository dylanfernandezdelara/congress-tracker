import type { CrossVoteLabel } from './stats-api-types'

/** Bucket session cross-party vote counts into a short label for UI copy. */
export function crossVoteLabel(count: number): CrossVoteLabel {
  if (count <= 2) return 'rare'
  if (count <= 7) return 'occasional'
  return 'frequent'
}

/** Human-readable hint for a cross-vote frequency label. */
export function crossVoteHint(label: CrossVoteLabel): string {
  switch (label) {
    case 'rare':
      return 'Rare party-line break'
    case 'occasional':
      return 'Occasional cross-voter'
    case 'frequent':
      return 'Frequent cross-voter'
    default: {
      const _exhaustive: never = label
      return _exhaustive
    }
  }
}

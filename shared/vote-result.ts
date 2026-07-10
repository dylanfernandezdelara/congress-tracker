function normalizeVoteResult(result: string): string {
  return result.toLowerCase()
}

function voteResultIndicatesFailure(normalized: string): boolean {
  return (
    normalized.includes('fail') ||
    normalized.includes('reject') ||
    normalized.includes('defeat') ||
    normalized.includes('disagreed') ||
    normalized.includes('not agreed')
  )
}

function voteResultIndicatesPassage(normalized: string): boolean {
  if (voteResultIndicatesFailure(normalized)) return false
  return normalized.includes('pass') || normalized.includes('agreed')
}

export function voteIndicatesPassage(result: string): boolean {
  return voteResultIndicatesPassage(normalizeVoteResult(result))
}

export function voteIndicatesFailure(result: string): boolean {
  return voteResultIndicatesFailure(normalizeVoteResult(result))
}

/** Semantic outcome for UI mapping — not a CSS class name. */
export type VoteResultKind = 'pass' | 'fail' | 'unknown'

export function voteResultKind(result: string): VoteResultKind {
  const normalized = normalizeVoteResult(result)
  if (voteResultIndicatesFailure(normalized)) return 'fail'
  if (voteResultIndicatesPassage(normalized)) return 'pass'
  return 'unknown'
}

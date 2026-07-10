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

export function voteIndicatesFailure(result: string): boolean {
  return voteResultIndicatesFailure(normalizeVoteResult(result))
}

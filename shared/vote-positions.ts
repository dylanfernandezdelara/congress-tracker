const YEA_POSITIONS = new Set(['Yea', 'Aye', 'Yes'])

export function normalizeVotePosition(position: string): 'yea' | 'nay' | 'other' {
  const trimmed = position.trim()
  if (YEA_POSITIONS.has(trimmed)) return 'yea'

  const normalized = trimmed.toLowerCase()
  if (normalized.includes('yea') || normalized.includes('aye') || normalized === 'yes') {
    return 'yea'
  }
  if (normalized.includes('nay') || normalized.includes('no')) return 'nay'
  return 'other'
}

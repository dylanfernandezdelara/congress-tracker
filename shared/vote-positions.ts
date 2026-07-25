/**
 * Non-voting positions must be recognized before yea/nay so an absence is never
 * scored as a vote. Congress.gov and Senate LIS both publish `Not Voting`, and
 * counting those as `Nay` invents party-line defectors out of absentees.
 */
const ABSTAIN_PATTERN = /not\s*voting|no\s*vote|present|abstain|absent|excused/

const YEA_PATTERN = /\b(yea|aye|yes)\b/
const NAY_PATTERN = /\b(nay|no)\b/

export function normalizeVotePosition(position: string): 'yea' | 'nay' | 'other' {
  const normalized = position.trim().toLowerCase()
  if (!normalized) return 'other'
  if (ABSTAIN_PATTERN.test(normalized)) return 'other'
  if (YEA_PATTERN.test(normalized)) return 'yea'
  if (NAY_PATTERN.test(normalized)) return 'nay'
  return 'other'
}

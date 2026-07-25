import type { RollPartySplit, VoteDefectorEntry } from '../api/types'

const PARTY_PLURALS: Record<string, string> = {
  R: 'Republicans',
  D: 'Democrats',
  I: 'Independents',
}

const PARTY_SINGULARS: Record<string, string> = {
  R: 'Republican',
  D: 'Democrat',
  I: 'Independent',
}

/** Normalize the many party spellings that reach the UI (`R`, `Republican`, `REP`). */
export function partyCode(party: string | null | undefined): string {
  const raw = (party ?? '').trim().toUpperCase()
  if (raw.startsWith('R')) return 'R'
  if (raw.startsWith('D')) return 'D'
  if (raw.startsWith('I')) return 'I'
  return raw.slice(0, 1) || '?'
}

export function partyNoun(party: string, count: number): string {
  const code = partyCode(party)
  if (count === 1) return PARTY_SINGULARS[code] ?? `${code} member`
  return PARTY_PLURALS[code] ?? `${code} members`
}

export function formatVoteSide(side: 'yea' | 'nay'): string {
  return side === 'yea' ? 'Yea' : 'Nay'
}

/** `R 218–0 · D 13–198` — reading order follows the largest caucus. */
export function formatPartySplits(splits: RollPartySplit[]): string {
  return splits
    .map((split) => `${partyCode(split.party)} ${split.yeas}–${split.nays}`)
    .join(' · ')
}

export interface DefectorPartyGroup {
  party: string
  position: 'yea' | 'nay'
  partyLine: 'yea' | 'nay'
  members: VoteDefectorEntry[]
  /** Members of this party who voted yea or nay on the roll, when known. */
  partyTotal: number | null
  /** `13 of 211 Democrats voted Yea; the caucus voted Nay.` */
  summary: string
}

/**
 * Group defectors by party and side so the UI can state the proportion that
 * broke ranks. A bare list of 13 same-party names reads as if the caucus split;
 * "13 of 211" is the context that makes the same data unambiguous.
 */
export function groupDefectorsByParty(
  defectors: VoteDefectorEntry[],
  splits: RollPartySplit[],
): DefectorPartyGroup[] {
  const totals = new Map<string, number>()
  for (const split of splits) {
    totals.set(partyCode(split.party), split.yeas + split.nays)
  }

  const groups = new Map<string, DefectorPartyGroup>()
  for (const defector of defectors) {
    const code = partyCode(defector.party)
    const key = `${code}:${defector.position}`
    const existing = groups.get(key)
    if (existing) {
      existing.members.push(defector)
      continue
    }
    groups.set(key, {
      party: code,
      position: defector.position,
      partyLine: defector.party_line,
      members: [defector],
      partyTotal: totals.get(code) ?? null,
      summary: '',
    })
  }

  const ordered = [...groups.values()].sort(
    (a, b) => b.members.length - a.members.length || a.party.localeCompare(b.party),
  )
  for (const group of ordered) {
    const count = group.members.length
    // The noun agrees with the number immediately before it: "1 of 53
    // Republicans", but "1 Republican" when no caucus total is available.
    const noun = partyNoun(group.party, group.partyTotal ?? count)
    const scope = group.partyTotal ? `${count} of ${group.partyTotal}` : String(count)
    group.summary =
      `${scope} ${noun} voted ${formatVoteSide(group.position)}` +
      ` — the caucus voted ${formatVoteSide(group.partyLine)}.`
  }
  return ordered
}

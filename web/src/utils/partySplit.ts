import {
  normalizePartyCode,
  partyDisplayName,
  partyShortLabel,
  type PartyCode,
} from '@congress-tracker/shared/party'

import type { RollPartySplit, VoteDefectorEntry } from '../api/types'

/** Prose noun for defector summaries; `Other` falls back so "Others" never appears. */
function partyNoun(party: string, count: number): string {
  const code = normalizePartyCode(party)
  if (code === 'Other') return count === 1 ? 'member' : 'members'
  const display = partyDisplayName(code)
  return count === 1 ? display : `${display}s`
}

export function formatVoteSide(side: 'yea' | 'nay'): string {
  return side === 'yea' ? 'Yea' : 'Nay'
}

/** `R 218–0 · D 13–198` — reading order follows the largest caucus. */
export function formatPartySplits(splits: RollPartySplit[]): string {
  return splits
    .map((split) => `${partyShortLabel(split.party)} ${split.yeas}–${split.nays}`)
    .join(' · ')
}

export interface DefectorPartyGroup {
  party: PartyCode
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
  const totals = new Map<PartyCode, number>()
  for (const split of splits) {
    totals.set(normalizePartyCode(split.party), split.yeas + split.nays)
  }

  const groups = new Map<string, DefectorPartyGroup>()
  for (const defector of defectors) {
    const code = normalizePartyCode(defector.party)
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

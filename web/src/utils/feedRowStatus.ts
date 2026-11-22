import { normalizePartyCode } from '@congress-tracker/shared/party'

import type { FeedItem } from '../api/types'
import { getFeedRowView, getPrimaryPassageVote } from './feedRowLabels'
import { textLargelyReplaced } from './billTextVersions'
import { readableMemberName } from './sponsorLabels'

export type FeedRowStatus = {
  /** One plain phrase: "Passed the Senate 62–33", "Introduced in the House by Rep. Jennifer L. McClellan (D-VA-4)". */
  text: string
  /** Outcome word colored by tone (Passed / Failed / Became law); the rest of the phrase is neutral. */
  lead: string
  rest: string
  kind: ReturnType<typeof getFeedRowView>['meta']['kind']
  toneClass: string
  /** "R 47–2 · D 14–30 · I 1–1" when member votes are in. */
  partySplit: string | null
  /** "On the President's desk" and similar next-step facts. */
  note: string | null
}

const PARTY_ORDER = ['R', 'D', 'I'] as const

export function formatPartySplit(item: FeedItem): string | null {
  const splits = getPrimaryPassageVote(item)?.party_splits
  if (!splits || splits.length === 0) return null
  const parts: string[] = []
  for (const code of PARTY_ORDER) {
    const split = splits.find((s) => normalizePartyCode(s.party) === code)
    if (split && split.yeas + split.nays > 0) parts.push(`${code} ${split.yeas}–${split.nays}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

function sponsorPhrase(item: FeedItem): string | null {
  const { name, bracket } = readableMemberName(item.primary_sponsor?.name)
  if (!name) return null
  return bracket ? `${name} (${bracket})` : name
}

/**
 * The collapsed row says what happened in one phrase instead of a row of chips
 * (outcome · tally · cohesion · chamber · bill id · committee · text grew).
 * Bill number, committee and text changes live in the expanded detail.
 */
export function getFeedRowStatus(item: FeedItem): FeedRowStatus {
  const { meta, eventDisplay, badgeToneClass } = getFeedRowView(item)
  const base = {
    kind: meta.kind,
    toneClass: badgeToneClass,
    // A summary of text the chamber replaced would misstate the vote; say so on the row.
    note: meta.presidentDeskChip ?? (textLargelyReplaced(item.text_changes) ? 'Text changed after summary' : null),
  }

  if (meta.kind === 'passed' || meta.kind === 'failed') {
    const lead = meta.outcomeLabel
    const where = meta.chamber ? (meta.kind === 'failed' ? ` in the ${meta.chamber}` : ` the ${meta.chamber}`) : ''
    const rest = `${where}${meta.margin ? ` ${meta.margin}` : ''}`
    return { ...base, lead, rest, text: `${lead}${rest}`, partySplit: formatPartySplit(item) }
  }

  if (meta.kind === 'introduced') {
    const sponsor = sponsorPhrase(item)
    const rest = `${meta.chamber ? ` in the ${meta.chamber}` : ''}${sponsor ? ` by ${sponsor}` : ''}`
    return { ...base, lead: 'Introduced', rest, text: `Introduced${rest}`, partySplit: null }
  }

  if (meta.kind === 'procedural') {
    return { ...base, lead: 'Procedural vote', rest: ` · ${eventDisplay}`, text: `Procedural vote · ${eventDisplay}`, partySplit: null }
  }

  // Became law, vetoed, no vote: the badge says it; add the tally when there was one.
  const rest = meta.margin && meta.chamber ? ` · ${meta.margin} in the ${meta.chamber}` : ''
  return { ...base, lead: meta.outcomeLabel, rest, text: `${meta.outcomeLabel}${rest}`, partySplit: formatPartySplit(item) }
}

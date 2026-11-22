import { partyShortLabel } from '@congress-tracker/shared/party'

import type { FeedPrimarySponsor } from '../api/types'

export type PrimarySponsorDisplay = {
  name: string | null
  meta: string
}

const CONGRESS_GOV_NAME = /^(?:(Rep|Sen|Del|Resident Commissioner)\.?\s+)?([^,\[]+),\s*([^\[]+?)\s*(?:\[([^\]]+)\])?$/

/**
 * Congress.gov names sponsors "Rep. Smucker, Lloyd [R-PA-11]". Readers expect
 * "Rep. Lloyd Smucker" with the party/state shown once, so split the bracket
 * off and put the given name first. Names in any other shape pass through.
 */
export function readableMemberName(raw: string | null | undefined): {
  name: string | null
  bracket: string | null
} {
  const trimmed = raw?.trim()
  if (!trimmed) return { name: null, bracket: null }
  const match = CONGRESS_GOV_NAME.exec(trimmed)
  if (!match) return { name: trimmed, bracket: null }
  const [, title, last, first, bracket] = match
  const name = [title ? (title.includes(" ") ? title : `${title}.`) : null, first.trim(), last.trim()].filter(Boolean).join(' ')
  return { name, bracket: bracket?.trim() || null }
}

/** Name and `D-NY` meta for the expanded-row sponsor line. Null when nothing useful is stored. */
export function primarySponsorDisplay(
  sponsor: FeedPrimarySponsor | null | undefined,
): PrimarySponsorDisplay | null {
  if (!sponsor) return null
  const readable = readableMemberName(sponsor.name)
  const name = readable.name
  const party = sponsor.party ? partyShortLabel(sponsor.party) : ''
  const meta = readable.bracket ?? [party, sponsor.state.trim()].filter(Boolean).join('-')
  if (!name && !meta) return null
  return { name, meta }
}

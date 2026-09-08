import { partyShortLabel } from '@congress-tracker/shared/party'

import type { FeedPrimarySponsor } from '../api/types'

export type PrimarySponsorDisplay = {
  name: string | null
  meta: string
}

/** Name and `D-NY` meta for the expanded-row sponsor line. Null when nothing useful is stored. */
export function primarySponsorDisplay(
  sponsor: FeedPrimarySponsor | null | undefined,
): PrimarySponsorDisplay | null {
  if (!sponsor) return null
  const name = sponsor.name?.trim() || null
  const party = sponsor.party ? partyShortLabel(sponsor.party) : ''
  const meta = [party, sponsor.state.trim()].filter(Boolean).join('-')
  if (!name && !meta) return null
  return { name, meta }
}

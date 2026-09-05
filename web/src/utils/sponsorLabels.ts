import { partyShortLabel } from '@congress-tracker/shared/party'

import type { FeedPrimarySponsor } from '../api/types'

/** Compact expanded-row line: `Rep. Jane Doe · D-NY`. Null when nothing useful is stored. */
export function formatPrimarySponsorLine(sponsor: FeedPrimarySponsor | null | undefined): string | null {
  if (!sponsor) return null
  const name = sponsor.name?.trim() || null
  const party = sponsor.party ? partyShortLabel(sponsor.party) : ''
  const meta = [party, sponsor.state.trim()].filter(Boolean).join('-')
  if (name && meta) return `${name} · ${meta}`
  if (name) return name
  return meta || null
}

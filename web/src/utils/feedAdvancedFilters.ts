import {
  normalizePolicyFilter,
  normalizeSponsorNameQuery,
  parseFeedChamberParam,
  parseFeedPartyParam,
  parseSponsorBioguideParam,
  type FeedChamberFilter,
  type FeedPartyFilter,
} from '@congress-tracker/shared/feed-filter-params'
import { partyDisplayName } from '@congress-tracker/shared/party'

import { parseStateFilter, stateFilterLabel, type StateFilter } from './stateFilter'

export type SponsorChamberFilter = FeedChamberFilter
export type PartyFilter = FeedPartyFilter

export type AdvancedFeedFilters = {
  state: StateFilter | null
  sponsorChamber: SponsorChamberFilter | null
  sponsor: string | null
  sponsorQ: string
  party: PartyFilter | null
  policy: string | null
}

export function parseSponsorChamberFilter(
  value: string | null | undefined,
): SponsorChamberFilter | null {
  return parseFeedChamberParam(value)
}

export function parsePartyFilter(value: string | null | undefined): PartyFilter | null {
  return parseFeedPartyParam(value)
}

export function parseSponsorFilter(value: string | null | undefined): string | null {
  return parseSponsorBioguideParam(value)
}

export function parseSponsorNameFilter(value: string | null | undefined): string {
  return normalizeSponsorNameQuery(value) ?? ''
}

export function parsePolicyFilter(value: string | null | undefined): string | null {
  return normalizePolicyFilter(value) ?? null
}

export function parseAdvancedFeedFilters(params: URLSearchParams): AdvancedFeedFilters {
  return {
    state: parseStateFilter(params.get('state')),
    sponsorChamber: parseSponsorChamberFilter(params.get('sponsor_chamber')),
    sponsor: parseSponsorFilter(params.get('sponsor')),
    sponsorQ: parseSponsorNameFilter(params.get('sponsor_q')),
    party: parsePartyFilter(params.get('party')),
    policy: parsePolicyFilter(params.get('policy')),
  }
}

export function advancedFilterCount(filters: AdvancedFeedFilters): number {
  let count = 0
  if (filters.state) count += 1
  if (filters.sponsorChamber) count += 1
  if (filters.sponsor) count += 1
  else if (filters.sponsorQ) count += 1
  if (filters.party) count += 1
  if (filters.policy) count += 1
  return count
}

export function advancedFilterSummary(
  filters: AdvancedFeedFilters,
  sponsorName?: string | null,
): string[] {
  const parts: string[] = []
  if (filters.state) parts.push(stateFilterLabel(filters.state))
  if (filters.sponsorChamber) parts.push(`${filters.sponsorChamber} sponsors`)
  if (filters.party) parts.push(partyDisplayName(filters.party))
  if (filters.sponsor) parts.push(sponsorName?.trim() || 'Selected member')
  else if (filters.sponsorQ) parts.push(`“${filters.sponsorQ}”`)
  if (filters.policy) parts.push(filters.policy)
  return parts
}

export function writeAdvancedFeedFilters(
  params: URLSearchParams,
  filters: AdvancedFeedFilters,
): void {
  const entries: Array<[string, string | null | undefined]> = [
    ['state', filters.state],
    ['sponsor_chamber', filters.sponsorChamber],
    ['sponsor', filters.sponsor],
    ['sponsor_q', filters.sponsor ? null : filters.sponsorQ || null],
    ['party', filters.party],
    ['policy', filters.policy],
  ]
  for (const [key, value] of entries) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
}

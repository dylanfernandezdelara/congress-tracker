import {
  normalizePolicyFilter,
  normalizeSponsorNameQuery,
  parseFeedChamberParam,
  parseFeedPartyParam,
  parseFeedStateParam,
  parseSponsorBioguideParam,
  type FeedChamberFilter,
  type FeedPartyFilter,
} from '@congress-tracker/shared/feed-filter-params'
import { partyDisplayName } from '@congress-tracker/shared/party'

import { stateFilterLabel } from './stateFilter'

export type AdvancedFeedFilters = {
  state: string | null
  sponsorChamber: FeedChamberFilter | null
  sponsor: string | null
  sponsorQ: string
  party: FeedPartyFilter | null
  policy: string | null
}

export function parseAdvancedFeedFilters(params: URLSearchParams): AdvancedFeedFilters {
  return {
    state: parseFeedStateParam(params.get('state')),
    sponsorChamber: parseFeedChamberParam(params.get('sponsor_chamber')),
    sponsor: parseSponsorBioguideParam(params.get('sponsor')),
    sponsorQ: normalizeSponsorNameQuery(params.get('sponsor_q')) ?? '',
    party: parseFeedPartyParam(params.get('party')),
    policy: normalizePolicyFilter(params.get('policy')) ?? null,
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

export type AdvancedFilterChip = {
  id: string
  label: string
  clear: Partial<AdvancedFeedFilters>
}

export function advancedFilterChips(
  filters: AdvancedFeedFilters,
  sponsorName?: string | null,
): AdvancedFilterChip[] {
  const chips: AdvancedFilterChip[] = []
  if (filters.state) {
    chips.push({
      id: 'state',
      label: stateFilterLabel(filters.state),
      clear: { state: null },
    })
  }
  if (filters.sponsorChamber) {
    chips.push({
      id: 'sponsorChamber',
      label: `${filters.sponsorChamber} sponsors`,
      clear: { sponsorChamber: null },
    })
  }
  if (filters.party) {
    chips.push({
      id: 'party',
      label: partyDisplayName(filters.party),
      clear: { party: null },
    })
  }
  if (filters.sponsor) {
    chips.push({
      id: 'sponsor',
      label: sponsorName?.trim() || 'Selected member',
      clear: { sponsor: null, sponsorQ: '' },
    })
  } else if (filters.sponsorQ) {
    chips.push({
      id: 'sponsorQ',
      label: `“${filters.sponsorQ}”`,
      clear: { sponsorQ: '' },
    })
  }
  if (filters.policy) {
    chips.push({
      id: 'policy',
      label: filters.policy,
      clear: { policy: null },
    })
  }
  return chips
}

export function advancedFilterSummary(
  filters: AdvancedFeedFilters,
  sponsorName?: string | null,
): string[] {
  return advancedFilterChips(filters, sponsorName).map((chip) => chip.label)
}

/** Write advanced feed filters into URLSearchParams or API query params. */
export function applyAdvancedFeedParams(
  params: URLSearchParams,
  filters: Partial<AdvancedFeedFilters>,
): void {
  const sponsor = filters.sponsor ?? null
  const entries: Array<[string, string | null | undefined]> = [
    ['state', filters.state],
    ['sponsor_chamber', filters.sponsorChamber],
    ['sponsor', sponsor],
    ['sponsor_q', sponsor ? null : filters.sponsorQ || null],
    ['party', filters.party],
    ['policy', filters.policy],
  ]
  for (const [key, value] of entries) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
}

export function emptyAdvancedFilters(): AdvancedFeedFilters {
  return {
    state: null,
    sponsorChamber: null,
    sponsor: null,
    sponsorQ: '',
    party: null,
    policy: null,
  }
}

/** Drop unset facets before calling fetchFeed / comparing filter objects. */
export function compactAdvancedFilters(
  filters: AdvancedFeedFilters,
): Partial<AdvancedFeedFilters> {
  return {
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.sponsorChamber ? { sponsorChamber: filters.sponsorChamber } : {}),
    ...(filters.sponsor ? { sponsor: filters.sponsor } : {}),
    ...(!filters.sponsor && filters.sponsorQ ? { sponsorQ: filters.sponsorQ } : {}),
    ...(filters.party ? { party: filters.party } : {}),
    ...(filters.policy ? { policy: filters.policy } : {}),
  }
}

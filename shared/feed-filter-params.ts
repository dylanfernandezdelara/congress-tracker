/** Shared parsers for advanced /feed/latest.json filter query params. */

import { normalizePartyCode, type PartyCode } from './party'
import { parseUsStateCode } from './us-states'

export type FeedChamberFilter = 'House' | 'Senate'
export type FeedPartyFilter = Exclude<PartyCode, 'Other'>

export const FEED_POLICY_MAX_LENGTH = 80
export const FEED_SPONSOR_Q_MAX_LENGTH = 80
export const FEED_SPONSOR_ID_MAX_LENGTH = 32

export function parseFeedChamberParam(
  value: string | null | undefined,
): FeedChamberFilter | null {
  if (value === 'House' || value === 'Senate') return value
  return null
}

export function parseFeedPartyParam(
  value: string | null | undefined,
): FeedPartyFilter | null {
  if (value == null || value.trim() === '') return null
  const code = normalizePartyCode(value)
  if (code === 'Other') return null
  return code
}

/**
 * Accept real bioguide ids and local seed ids (`LOCAL:…`). Reject LIS placeholders.
 */
export function parseSponsorBioguideParam(
  value: string | null | undefined,
): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (trimmed.length > FEED_SPONSOR_ID_MAX_LENGTH) return null
  if (trimmed.startsWith('LIS:')) return null
  if (/^LOCAL:[A-Za-z0-9]{1,24}$/.test(trimmed)) return trimmed
  if (/^[A-Za-z]\d{5,6}$/.test(trimmed)) return trimmed
  return null
}

export function normalizeSponsorNameQuery(
  raw: string | null | undefined,
): string | undefined {
  if (raw == null) return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  return trimmed.length > FEED_SPONSOR_Q_MAX_LENGTH
    ? trimmed.slice(0, FEED_SPONSOR_Q_MAX_LENGTH)
    : trimmed
}

export function normalizePolicyFilter(
  raw: string | null | undefined,
): string | undefined {
  if (raw == null) return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  return trimmed.length > FEED_POLICY_MAX_LENGTH
    ? trimmed.slice(0, FEED_POLICY_MAX_LENGTH)
    : trimmed
}

export function parseFeedStateParam(value: string | null | undefined): string | null {
  return parseUsStateCode(value)
}

/** Party string aliases accepted in SQL IN (…) for D/R/I. */
export function partySqlAliases(party: FeedPartyFilter): readonly string[] {
  switch (party) {
    case 'D':
      return ['D', 'DEM', 'DEMOCRAT', 'DEMOCRATIC']
    case 'R':
      return ['R', 'REP', 'REPUBLICAN']
    case 'I':
      return ['I', 'IND', 'INDEPENDENT']
    default: {
      const _exhaustive: never = party
      return _exhaustive
    }
  }
}

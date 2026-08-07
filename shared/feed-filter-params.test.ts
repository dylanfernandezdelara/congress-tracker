import { describe, expect, it } from 'vitest'

import {
  normalizePolicyFilter,
  normalizeSponsorNameQuery,
  parseFeedChamberParam,
  parseFeedPartyParam,
  parseSponsorBioguideParam,
  partySqlAliases,
} from './feed-filter-params'

describe('parseFeedChamberParam', () => {
  it('accepts House and Senate only', () => {
    expect(parseFeedChamberParam('House')).toBe('House')
    expect(parseFeedChamberParam('Senate')).toBe('Senate')
    expect(parseFeedChamberParam('house')).toBeNull()
    expect(parseFeedChamberParam('')).toBeNull()
  })
})

describe('parseFeedPartyParam', () => {
  it('normalizes common party labels to D/R/I', () => {
    expect(parseFeedPartyParam('D')).toBe('D')
    expect(parseFeedPartyParam('democrat')).toBe('D')
    expect(parseFeedPartyParam('Republican')).toBe('R')
    expect(parseFeedPartyParam('IND')).toBe('I')
    expect(parseFeedPartyParam('Other')).toBeNull()
    expect(parseFeedPartyParam('')).toBeNull()
  })
})

describe('parseSponsorBioguideParam', () => {
  it('accepts real bioguides and LOCAL seed ids', () => {
    expect(parseSponsorBioguideParam('A000001')).toBe('A000001')
    expect(parseSponsorBioguideParam('LOCAL:H002')).toBe('LOCAL:H002')
    expect(parseSponsorBioguideParam('LIS:S001')).toBeNull()
    expect(parseSponsorBioguideParam('not-an-id')).toBeNull()
  })
})

describe('normalizeSponsorNameQuery / normalizePolicyFilter', () => {
  it('trims and truncates', () => {
    expect(normalizeSponsorNameQuery('  Schumer  ')).toBe('Schumer')
    expect(normalizeSponsorNameQuery('x'.repeat(100))?.length).toBe(80)
    expect(normalizePolicyFilter('  Energy  ')).toBe('Energy')
    expect(normalizePolicyFilter('   ')).toBeUndefined()
  })
})

describe('partySqlAliases', () => {
  it('lists SQL match aliases per party', () => {
    expect(partySqlAliases('D')).toContain('DEMOCRATIC')
    expect(partySqlAliases('R')).toContain('REPUBLICAN')
    expect(partySqlAliases('I')).toContain('INDEPENDENT')
  })
})

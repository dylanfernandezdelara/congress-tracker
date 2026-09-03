import { describe, expect, it } from 'vitest'

import {
  congressGovBillUrl,
  congressOrdinal,
  containsLocalSampleLabel,
  formatBillDocket,
  isHouseOriginBillType,
  stripLocalSampleLabel,
} from './bill-id'

describe('congressOrdinal', () => {
  it('uses English ordinal suffixes', () => {
    expect(congressOrdinal(121)).toBe('121st')
    expect(congressOrdinal(122)).toBe('122nd')
    expect(congressOrdinal(123)).toBe('123rd')
    expect(congressOrdinal(119)).toBe('119th')
    expect(congressOrdinal(111)).toBe('111th')
    expect(congressOrdinal(112)).toBe('112th')
    expect(congressOrdinal(113)).toBe('113th')
  })
})

describe('congressGovBillUrl', () => {
  it('maps every bill type to its long-form congress.gov path', () => {
    expect(congressGovBillUrl(119, 'HR', 1)).toBe(
      'https://www.congress.gov/bill/119th-congress/house-bill/1',
    )
    expect(congressGovBillUrl(119, 'S', 5)).toBe(
      'https://www.congress.gov/bill/119th-congress/senate-bill/5',
    )
    expect(congressGovBillUrl(119, 'HRES', 5)).toBe(
      'https://www.congress.gov/bill/119th-congress/house-resolution/5',
    )
    expect(congressGovBillUrl(119, 'SRES', 1)).toBe(
      'https://www.congress.gov/bill/119th-congress/senate-resolution/1',
    )
    expect(congressGovBillUrl(119, 'HJRES', 9)).toBe(
      'https://www.congress.gov/bill/119th-congress/house-joint-resolution/9',
    )
    expect(congressGovBillUrl(119, 'SJRES', 1)).toBe(
      'https://www.congress.gov/bill/119th-congress/senate-joint-resolution/1',
    )
    expect(congressGovBillUrl(119, 'HCONRES', 14)).toBe(
      'https://www.congress.gov/bill/119th-congress/house-concurrent-resolution/14',
    )
    expect(congressGovBillUrl(119, 'SCONRES', 7)).toBe(
      'https://www.congress.gov/bill/119th-congress/senate-concurrent-resolution/7',
    )
  })
})

describe('local sample labels', () => {
  it('detects and strips the offline seed marker', () => {
    expect(containsLocalSampleLabel('21st Century ROAD to Housing Act (local sample)')).toBe(true)
    expect(containsLocalSampleLabel('Overhauls federal housing programs (local sample)')).toBe(true)
    expect(containsLocalSampleLabel('21st Century ROAD to Housing Act')).toBe(false)
    expect(containsLocalSampleLabel(null)).toBe(false)
    expect(stripLocalSampleLabel('21st Century ROAD to Housing Act (local sample)')).toBe(
      '21st Century ROAD to Housing Act',
    )
  })
})

describe('isHouseOriginBillType', () => {
  it('keeps House docket types and drops Senate-origin codes', () => {
    expect(isHouseOriginBillType('HR')).toBe(true)
    expect(isHouseOriginBillType('hres')).toBe(true)
    expect(isHouseOriginBillType('H.J.Res.')).toBe(true)
    expect(isHouseOriginBillType('HCONRES')).toBe(true)
    expect(isHouseOriginBillType('S')).toBe(false)
    expect(isHouseOriginBillType('SRES')).toBe(false)
    expect(isHouseOriginBillType('SJRES')).toBe(false)
    expect(isHouseOriginBillType('SCONRES')).toBe(false)
  })
})

describe('formatBillDocket', () => {
  it('formats concurrent and joint resolutions with ordinal congress', () => {
    expect(formatBillDocket('hconres', 84, 119)).toBe('H.Con.Res. 84 · 119th Congress')
    expect(formatBillDocket('HJRES', 12, 119)).toBe('H.J.Res. 12 · 119th Congress')
  })
})

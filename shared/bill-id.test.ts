import { describe, expect, it } from 'vitest'

import {
  congressGovBillUrl,
  congressOrdinal,
  containsLocalSampleLabel,
  formatBillDocket,
  formatBillQueryParam,
  isHouseOriginBillType,
  originBillTypesSqlList,
  originChamberFromBillType,
  parseBillQueryParam,
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

describe('originChamberFromBillType', () => {
  it('maps House and Senate docket types', () => {
    expect(originChamberFromBillType('HR')).toBe('House')
    expect(originChamberFromBillType('h.j.res.')).toBe('House')
    expect(originChamberFromBillType('S')).toBe('Senate')
    expect(originChamberFromBillType('sres')).toBe('Senate')
    expect(originChamberFromBillType('xyz')).toBe(null)
  })

  it('exports matching SQL IN lists', () => {
    expect(originBillTypesSqlList('House')).toBe("('HR','HRES','HJRES','HCONRES')")
    expect(originBillTypesSqlList('Senate')).toBe("('S','SRES','SJRES','SCONRES')")
  })
})

describe('formatBillDocket', () => {
  it('formats concurrent and joint resolutions with ordinal congress', () => {
    expect(formatBillDocket('hconres', 84, 119)).toBe('H.Con.Res. 84 · 119th Congress')
    expect(formatBillDocket('HJRES', 12, 119)).toBe('H.J.Res. 12 · 119th Congress')
  })
})

describe('bill query param', () => {
  it('formats congress-type-number with a lowercase type', () => {
    expect(formatBillQueryParam({ congress: 119, type: 'HR', number: 1 })).toBe('119-hr-1')
    expect(formatBillQueryParam({ congress: 119, type: 'H.J.Res.', number: 12 })).toBe(
      '119-hjres-12',
    )
  })

  it('parses share params case-insensitively and rejects unknown types', () => {
    expect(parseBillQueryParam('119-HR-4795')).toEqual({
      congress: 119,
      type: 'HR',
      number: 4795,
    })
    expect(parseBillQueryParam(' 119-s-2 ')).toEqual({ congress: 119, type: 'S', number: 2 })
    expect(parseBillQueryParam('119-xyz-1')).toBeNull()
    expect(parseBillQueryParam('hr-1')).toBeNull()
    expect(parseBillQueryParam('')).toBeNull()
  })
})

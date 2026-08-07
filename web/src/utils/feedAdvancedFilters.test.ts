import { describe, expect, it } from 'vitest'

import {
  advancedFilterCount,
  advancedFilterSummary,
  applyAdvancedFeedParams,
  parseAdvancedFeedFilters,
} from './feedAdvancedFilters'

describe('parseAdvancedFeedFilters', () => {
  it('parses sponsor facets from search params', () => {
    const params = new URLSearchParams(
      'state=ny&sponsor_chamber=Senate&party=democrat&sponsor=A000001&sponsor_q=Schumer&policy=Energy',
    )
    expect(parseAdvancedFeedFilters(params)).toEqual({
      state: 'NY',
      sponsorChamber: 'Senate',
      sponsor: 'A000001',
      sponsorQ: 'Schumer',
      party: 'D',
      policy: 'Energy',
    })
  })
})

describe('applyAdvancedFeedParams', () => {
  it('prefers exact sponsor over sponsor_q in the URL', () => {
    const params = new URLSearchParams()
    applyAdvancedFeedParams(params, {
      state: 'NY',
      sponsorChamber: 'House',
      sponsor: 'LOCAL:H002',
      sponsorQ: 'Loyal',
      party: 'D',
      policy: 'Energy',
    })
    expect(params.get('state')).toBe('NY')
    expect(params.get('sponsor_chamber')).toBe('House')
    expect(params.get('sponsor')).toBe('LOCAL:H002')
    expect(params.get('sponsor_q')).toBeNull()
    expect(params.get('party')).toBe('D')
    expect(params.get('policy')).toBe('Energy')
  })
})

describe('advancedFilterSummary / count', () => {
  it('summarizes active filters for chrome copy', () => {
    const filters = {
      state: 'NY',
      sponsorChamber: 'Senate' as const,
      sponsor: null,
      sponsorQ: 'Schumer',
      party: 'D' as const,
      policy: 'Energy',
    }
    expect(advancedFilterCount(filters)).toBe(5)
    expect(advancedFilterSummary(filters)).toEqual([
      'New York',
      'Senate sponsors',
      'Democrat',
      '“Schumer”',
      'Energy',
    ])
  })
})

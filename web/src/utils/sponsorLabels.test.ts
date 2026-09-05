import { describe, expect, it } from 'vitest'

import { formatPrimarySponsorLine } from './sponsorLabels'

describe('formatPrimarySponsorLine', () => {
  it('joins name with party-state', () => {
    expect(
      formatPrimarySponsorLine({
        bioguide_id: 'LOCAL:H002',
        name: 'Rep. Sample Loyal (local)',
        party: 'D',
        state: 'NY',
      }),
    ).toBe('Rep. Sample Loyal (local) · D-NY')
  })

  it('returns name only when party and state are missing', () => {
    expect(
      formatPrimarySponsorLine({
        bioguide_id: 'LOCAL:H002',
        name: 'Rep. Sample Loyal (local)',
        party: null,
        state: '',
      }),
    ).toBe('Rep. Sample Loyal (local)')
  })

  it('returns null when the sponsor row is empty', () => {
    expect(
      formatPrimarySponsorLine({
        bioguide_id: 'LOCAL:H002',
        name: null,
        party: null,
        state: '',
      }),
    ).toBeNull()
    expect(formatPrimarySponsorLine(null)).toBeNull()
  })
})

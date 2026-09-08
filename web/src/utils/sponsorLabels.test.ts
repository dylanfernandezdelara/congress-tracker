import { describe, expect, it } from 'vitest'

import { primarySponsorDisplay } from './sponsorLabels'

describe('primarySponsorDisplay', () => {
  it('splits name and party-state meta for interactive rendering', () => {
    expect(
      primarySponsorDisplay({
        bioguide_id: 'LOCAL:H002',
        name: 'Rep. Sample Loyal (local)',
        party: 'D',
        state: 'NY',
      }),
    ).toEqual({ name: 'Rep. Sample Loyal (local)', meta: 'D-NY' })
  })

  it('returns name only when party and state are missing', () => {
    expect(
      primarySponsorDisplay({
        bioguide_id: 'LOCAL:H002',
        name: 'Rep. Sample Loyal (local)',
        party: null,
        state: '',
      }),
    ).toEqual({ name: 'Rep. Sample Loyal (local)', meta: '' })
  })

  it('returns null when the sponsor row is empty', () => {
    expect(
      primarySponsorDisplay({
        bioguide_id: 'LOCAL:H002',
        name: null,
        party: null,
        state: '',
      }),
    ).toBeNull()
    expect(primarySponsorDisplay(null)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { proceduralHeadline, trimDisplayTitle } from './billLabels'

describe('trimDisplayTitle', () => {
  it('removes the boilerplate suffix', () => {
    expect(trimDisplayTitle('Authorize support for Ukraine, and for other purposes.')).toBe(
      'Authorize support for Ukraine',
    )
  })

  it('removes the suffix without a leading comma', () => {
    expect(trimDisplayTitle('Sample bill and for other purposes.')).toBe('Sample bill')
  })
})

describe('proceduralHeadline', () => {
  it('rewrites providing-for-consideration rule resolutions', () => {
    const title =
      'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.'

    expect(proceduralHeadline(title)).toBe(
      'Sets up House debate on H.R. 2913: Authorize support for Ukraine',
    )
  })

  it('rewrites rule-waiver resolutions', () => {
    const title =
      'Waiving a requirement of clause 6(a) of rule XIII with respect to consideration of certain resolutions reported from the Committee on Rules.'

    expect(proceduralHeadline(title)).toBe('Fast-tracks floor consideration (rule waiver)')
  })

  it('returns null for non-matching titles', () => {
    expect(proceduralHeadline('A regular bill title about infrastructure.')).toBeNull()
  })
})

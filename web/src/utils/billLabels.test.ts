import { describe, expect, it } from 'vitest'

import {
  billDidNotPass,
  formatBillDocket,
  proceduralHeadline,
  trimDisplayTitle,
  voteResultClass,
} from './billLabels'

describe('formatBillDocket', () => {
  it('formats concurrent resolutions', () => {
    expect(formatBillDocket('hconres', 84, 119)).toBe('H.Con.Res. 84 · 119th Congress')
  })

  it('formats joint resolutions', () => {
    expect(formatBillDocket('HJRES', 12, 119)).toBe('H.J.Res. 12 · 119th Congress')
  })
})

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

describe('billDidNotPass', () => {
  it('returns false for an empty vote list', () => {
    expect(billDidNotPass([])).toBe(false)
  })

  it('returns false when a vote passed', () => {
    expect(billDidNotPass([{ result: 'Passed' }])).toBe(false)
  })

  it('returns false when a vote was agreed to', () => {
    expect(billDidNotPass([{ result: 'Agreed to' }])).toBe(false)
  })

  it('returns true when a vote failed', () => {
    expect(billDidNotPass([{ result: 'Failed' }])).toBe(true)
  })

  it('returns true when a Senate bill was defeated', () => {
    expect(billDidNotPass([{ result: 'Bill Defeated' }])).toBe(true)
  })

  it('returns true when all votes failed or were rejected', () => {
    expect(billDidNotPass([{ result: 'Failed' }, { result: 'Rejected' }])).toBe(true)
  })

  it('returns false when at least one vote passed among mixed results', () => {
    expect(
      billDidNotPass([
        { result: 'Failed' },
        { result: 'Passed' },
      ]),
    ).toBe(false)
  })

  it('returns false when the result string is blank', () => {
    expect(billDidNotPass([{ result: '' }])).toBe(false)
  })

  it('returns false when the result string is unrecognized', () => {
    expect(billDidNotPass([{ result: 'Cloture Motion' }])).toBe(false)
  })

  it('returns true when a vote was disagreed to', () => {
    expect(billDidNotPass([{ result: 'Disagreed to' }])).toBe(true)
  })

  it('returns true when a vote was not agreed to', () => {
    expect(billDidNotPass([{ result: 'Not Agreed to' }])).toBe(true)
  })
})

describe('voteResultClass', () => {
  it('marks Senate defeat results as fail', () => {
    expect(voteResultClass('Bill Defeated')).toBe('text-fail')
  })

  it('marks disagreed results as fail', () => {
    expect(voteResultClass('Disagreed to')).toBe('text-fail')
  })

  it('marks passed results as pass', () => {
    expect(voteResultClass('Passed')).toBe('text-pass')
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

  it('rewrites nullification resolutions', () => {
    const title =
      'Providing that section 11 of House Resolution 1224 shall have no force or effect.'

    expect(proceduralHeadline(title)).toBe('Nullifies section 11 of H.Res. 1224')
  })

  it('returns null for non-matching titles', () => {
    expect(proceduralHeadline('A regular bill title about infrastructure.')).toBeNull()
  })
})

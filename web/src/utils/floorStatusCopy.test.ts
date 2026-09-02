import { describe, expect, it } from 'vitest'

import { chamberReturnCopy, floorChipLabel } from './floorStatusCopy'

const formatDay = (iso: string) =>
  iso === '2026-08-31' ? 'Monday, Aug 31' : iso === '2026-09-14' ? 'Monday, Sep 14' : iso

describe('floorChipLabel', () => {
  it('names both chambers when they share a status', () => {
    expect(floorChipLabel({ status: 'working' }, { status: 'working' })).toBe(
      'House & Senate working',
    )
    expect(floorChipLabel({ status: 'in_session' }, { status: 'in_session' })).toBe(
      'House & Senate in session',
    )
    expect(floorChipLabel({ status: 'in_recess' }, { status: 'in_recess' })).toBe(
      'House & Senate in recess',
    )
  })

  it('does not collapse mixed floors to a single Working label', () => {
    expect(floorChipLabel({ status: 'working' }, { status: 'in_recess' })).toBe(
      'House working · Senate in recess',
    )
    expect(floorChipLabel({ status: 'in_recess' }, { status: 'working' })).toBe(
      'House in recess · Senate working',
    )
    expect(floorChipLabel({ status: 'working' }, { status: 'in_session' })).toBe(
      'House working · Senate in session',
    )
  })

  it('names the known chamber when the other status is missing', () => {
    expect(floorChipLabel({ status: 'working' }, { status: null })).toBe('House working')
    expect(floorChipLabel({ status: null }, { status: 'in_session' })).toBe('Senate in session')
  })

  it('hides the chip when neither chamber has a status', () => {
    expect(floorChipLabel({ status: null }, { status: null })).toBeNull()
  })
})

describe('chamberReturnCopy', () => {
  it('leads with Back when a published return exists', () => {
    expect(
      chamberReturnCopy({ status: 'in_recess', returnsOn: '2026-08-31' }, formatDay),
    ).toBe('Back Monday, Aug 31')
  })

  it('explains a missing published return', () => {
    expect(chamberReturnCopy({ status: 'in_recess', returnsOn: null }, formatDay)).toBe(
      'No published return date.',
    )
  })

  it('hides return copy when the chamber is not in recess', () => {
    expect(chamberReturnCopy({ status: 'working', returnsOn: '2026-08-31' }, formatDay)).toBeNull()
  })
})

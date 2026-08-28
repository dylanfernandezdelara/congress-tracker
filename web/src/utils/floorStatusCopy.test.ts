import { describe, expect, it } from 'vitest'

import { chamberReturnCopy, floorStatusTogetherCopy } from './floorStatusCopy'

const formatDay = (iso: string) =>
  iso === '2026-08-31' ? 'Monday, Aug 31' : iso === '2026-09-14' ? 'Monday, Sep 14' : iso

describe('floorStatusTogetherCopy', () => {
  it('says both chambers are out and names the different return dates', () => {
    expect(
      floorStatusTogetherCopy(
        { status: 'in_recess', statusLabel: 'In recess', returnsOn: '2026-08-31' },
        { status: 'in_recess', statusLabel: 'In recess', returnsOn: '2026-09-14' },
        formatDay,
      ),
    ).toBe(
      'House and Senate are both in recess, but they do not return together. The House is scheduled back Monday, Aug 31. The Senate is scheduled back Monday, Sep 14.',
    )
  })

  it('names whichever chamber returns first without assuming House', () => {
    expect(
      floorStatusTogetherCopy(
        { status: 'in_recess', statusLabel: 'In recess', returnsOn: '2026-04-14' },
        { status: 'in_recess', statusLabel: 'In recess', returnsOn: '2026-04-13' },
        (iso) => (iso === '2026-04-13' ? 'Monday, Apr 13' : 'Tuesday, Apr 14'),
      ),
    ).toBe(
      'House and Senate are both in recess, but they do not return together. The House is scheduled back Tuesday, Apr 14. The Senate is scheduled back Monday, Apr 13.',
    )
  })

  it('says they return together when the calendars match', () => {
    expect(
      floorStatusTogetherCopy(
        { status: 'in_recess', statusLabel: 'In recess', returnsOn: '2026-09-14' },
        { status: 'in_recess', statusLabel: 'In recess', returnsOn: '2026-09-14' },
        formatDay,
      ),
    ).toMatch(/both in recess and are scheduled back Monday, Sep 14/)
  })

  it('names the chamber that is still working', () => {
    expect(
      floorStatusTogetherCopy(
        { status: 'working', statusLabel: 'Working', returnsOn: null },
        { status: 'in_recess', statusLabel: 'In recess', returnsOn: '2026-09-14' },
        formatDay,
      ),
    ).toBe(
      'The Senate is in recess until Monday, Sep 14. The House is working. They do not always recess at the same time.',
    )
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
      'Leadership has not published a return date for this stretch.',
    )
  })

  it('hides return copy when the chamber is not in recess', () => {
    expect(chamberReturnCopy({ status: 'working', returnsOn: '2026-08-31' }, formatDay)).toBeNull()
  })
})

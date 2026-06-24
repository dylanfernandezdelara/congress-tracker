import { describe, expect, it } from 'vitest'

import { CURRENT_PRESIDENT } from './president'

describe('CURRENT_PRESIDENT', () => {
  it('defines name, party, and term dates for the home Federal control card', () => {
    expect(CURRENT_PRESIDENT.name.length).toBeGreaterThan(0)
    expect(CURRENT_PRESIDENT.party).toMatch(/^[DRI]$/)
    expect(CURRENT_PRESIDENT.termStart).toMatch(/^\w{3} \d{1,2}, \d{4}$/)
    expect(CURRENT_PRESIDENT.termEnd).toMatch(/^\w{3} \d{1,2}, \d{4}$/)
  })
})

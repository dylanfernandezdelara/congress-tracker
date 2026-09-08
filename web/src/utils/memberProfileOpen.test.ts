import { describe, expect, it } from 'vitest'

import { canOpenMemberProfile } from './memberProfileOpen'

describe('canOpenMemberProfile', () => {
  it('allows real bioguide and LOCAL: seed ids', () => {
    expect(canOpenMemberProfile('F000466')).toBe(true)
    expect(canOpenMemberProfile('LOCAL:H002')).toBe(true)
  })

  it('rejects empty and LIS: placeholder ids', () => {
    expect(canOpenMemberProfile('')).toBe(false)
    expect(canOpenMemberProfile('   ')).toBe(false)
    expect(canOpenMemberProfile(null)).toBe(false)
    expect(canOpenMemberProfile('LIS:S123')).toBe(false)
  })
})

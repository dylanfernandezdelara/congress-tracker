import { describe, expect, it } from 'vitest'

import { formatExecutiveRoleLabel, formatRelatedExecutiveBillLine } from './executiveLabels'

describe('executiveLabels', () => {
  it('labels primary role for feed context', () => {
    expect(formatExecutiveRoleLabel('primary')).toBe('About this bill')
    expect(formatExecutiveRoleLabel('conditional')).toBe('Must pass first')
  })

  it('formats related bill lines with role', () => {
    expect(formatRelatedExecutiveBillLine({
      congress: 119,
      type: 'HR',
      number: 22,
      title: 'SAVE Act',
      role: 'conditional',
    })).toContain('H.R. 22')
    expect(formatRelatedExecutiveBillLine({
      congress: 119,
      type: 'HR',
      number: 22,
      title: 'SAVE Act',
      role: 'conditional',
    })).toContain('Must pass first')
  })
})

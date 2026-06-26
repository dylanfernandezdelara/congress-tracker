import { describe, expect, it } from 'vitest'

import { formatExecutiveRoleLabel, getBillColloquialName } from './executiveLabels'

describe('executiveLabels', () => {
  it('labels primary role for feed context', () => {
    expect(formatExecutiveRoleLabel('primary')).toBe('About this bill')
    expect(formatExecutiveRoleLabel('conditional')).toBe('Must pass first')
  })

  it('prefers digest headline over formal bill number', () => {
    expect(
      getBillColloquialName({
        congress: 119,
        type: 'HR',
        number: 6644,
        title: '21st Century ROAD to Housing Act',
        headline: 'Overhauls federal housing programs',
      }),
    ).toBe('Overhauls federal housing programs')
  })

  it('falls back to title then short bill id', () => {
    expect(
      getBillColloquialName({
        congress: 119,
        type: 'HR',
        number: 22,
        title: 'SAVE Act',
      }),
    ).toBe('SAVE Act')

    expect(
      getBillColloquialName({
        congress: 119,
        type: 'HR',
        number: 9999,
      }),
    ).toBe('H.R. 9999')
  })
})

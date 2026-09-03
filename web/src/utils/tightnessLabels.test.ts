import { describe, expect, it } from 'vitest'

import { makeTightnessDot } from '../test/tightnessFixtures'
import {
  cohesionLabel,
  tightnessDotAriaLabel,
  tightnessDotKey,
  tightnessDotLabel,
  tightnessDotLeftPercent,
} from './tightnessLabels'

describe('tightnessLabels', () => {
  it('labels bills vs nominees so a 50–49 confirm is not read as a bill', () => {
    expect(tightnessDotLabel(makeTightnessDot())).toBe('H.R. 88')
    expect(
      tightnessDotLabel(
        makeTightnessDot({
          kind: 'nominee',
          chamber: 'Senate',
          nominee_name: 'Jane Doe',
          bill_type: null,
          bill_number: null,
        }),
      ),
    ).toBe('Jane Doe')
    expect(tightnessDotAriaLabel(makeTightnessDot())).toMatch(/House bill H\.R\. 88/)
    expect(
      tightnessDotAriaLabel(
        makeTightnessDot({
          kind: 'nominee',
          chamber: 'Senate',
          yeas: 50,
          nays: 49,
          yea_pct: 50 / 99,
          nominee_name: 'Pam Bondi',
          bill_type: null,
          bill_number: null,
        }),
      ),
    ).toMatch(/Senate nominee Pam Bondi/)
  })

  it('places 50% yea at the left and steamrolls at the right', () => {
    expect(tightnessDotLeftPercent(makeTightnessDot({ yea_pct: 0.5 }))).toBe(0)
    expect(tightnessDotLeftPercent(makeTightnessDot({ yea_pct: 1 }))).toBe(100)
    expect(cohesionLabel('party-line')).toBe('party-line')
    expect(tightnessDotKey(makeTightnessDot())).toBe('bill:House:119:2:9010')
  })
})

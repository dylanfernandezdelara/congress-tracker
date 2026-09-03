import { describe, expect, it } from 'vitest'

import { makeTightnessDot } from '../test/tightnessFixtures'
import {
  HOUSE_CLOSEST_LIMIT,
  HOUSE_MARGIN_CAP,
  SENATE_CLOSEST_LIMIT,
  SENATE_MARGIN_CAP,
  cohesionLabel,
  selectClosestVotes,
  tightnessBarLabel,
  tightnessBarWidth,
  tightnessDotAriaLabel,
  tightnessDotKey,
  tightnessDotLabel,
} from './tightnessLabels'

describe('tightnessLabels', () => {
  it('labels bills vs nominees so a confirm is not read as a bill id', () => {
    expect(tightnessDotLabel(makeTightnessDot())).toBe('H.R. 88')
    expect(tightnessBarLabel(makeTightnessDot({ bill_type: 'HRES', bill_number: 1499 }))).toBe(
      'H.Res. 1499 · 210–208',
    )
    expect(
      tightnessBarLabel(
        makeTightnessDot({
          kind: 'nominee',
          chamber: 'Senate',
          yeas: 58,
          nays: 40,
          nominee_name: 'Jane Doe',
          bill_type: null,
          bill_number: null,
        }),
      ),
    ).toBe('PN · Jane Doe · 58–40')
    expect(tightnessDotAriaLabel(makeTightnessDot())).toMatch(/House bill H\.R\. 88, 210–208, party-line$/)
    expect(
      tightnessDotAriaLabel(
        makeTightnessDot({
          kind: 'nominee',
          chamber: 'Senate',
          yeas: 51,
          nays: 49,
          yea_pct: 51 / 100,
          nominee_name: 'Pam Bondi',
          bill_type: null,
          bill_number: null,
        }),
      ),
    ).toMatch(/Senate nominee Pam Bondi, 51–49/)
  })

  it('appends failed from the official roll result', () => {
    const failed = makeTightnessDot({
      roll_number: 9013,
      yeas: 212,
      nays: 206,
      result: 'Failed',
      yea_pct: 212 / 418,
    })
    expect(tightnessBarLabel(failed)).toBe('H.R. 88 · 212–206 failed')
    expect(tightnessDotAriaLabel(failed)).toMatch(/212–206, party-line, failed$/)
  })

  it('keeps cohesion labels for party-line vs bipartisan', () => {
    expect(cohesionLabel('party-line')).toBe('party-line')
    expect(cohesionLabel('bipartisan')).toBe('bipartisan')
    expect(tightnessDotKey(makeTightnessDot())).toBe('bill:House:119:2:9010')
  })
})

describe('tightnessBarWidth', () => {
  it('is monotonic in |yeas−nays| inside the cap and never uses yea%', () => {
    const knife = makeTightnessDot({ yeas: 210, nays: 208 })
    const close = makeTightnessDot({ yeas: 218, nays: 201 })
    const failed = makeTightnessDot({ yeas: 212, nays: 206 })
    expect(tightnessBarWidth(knife, HOUSE_MARGIN_CAP)).toBe(2 / 20)
    expect(tightnessBarWidth(failed, HOUSE_MARGIN_CAP)).toBe(6 / 20)
    expect(tightnessBarWidth(close, HOUSE_MARGIN_CAP)).toBe(17 / 20)
    expect(tightnessBarWidth(knife, HOUSE_MARGIN_CAP)).toBeLessThan(
      tightnessBarWidth(close, HOUSE_MARGIN_CAP),
    )
    expect(tightnessBarWidth(makeTightnessDot({ yeas: 421, nays: 1 }), HOUSE_MARGIN_CAP)).toBe(1)
    expect(tightnessBarWidth(makeTightnessDot({ yeas: 58, nays: 40 }), SENATE_MARGIN_CAP)).toBe(1)
  })
})

describe('selectClosestVotes', () => {
  it('sorts closest first and drops the steamroll tail', () => {
    const knife = makeTightnessDot()
    const close = makeTightnessDot({
      roll_number: 9005,
      bill_number: 1,
      yeas: 218,
      nays: 201,
      yea_pct: 218 / 419,
      vote_date: '2026-07-21',
    })
    const failed = makeTightnessDot({
      roll_number: 9013,
      bill_number: 99,
      yeas: 212,
      nays: 206,
      result: 'Failed',
      yea_pct: 212 / 418,
      vote_date: '2026-07-20',
    })
    const steamroll = makeTightnessDot({
      roll_number: 9012,
      bill_number: 33,
      yeas: 421,
      nays: 1,
      yea_pct: 421 / 422,
      vote_date: '2026-07-21',
    })
    const selected = selectClosestVotes(
      [steamroll, close, knife, failed],
      HOUSE_MARGIN_CAP,
      HOUSE_CLOSEST_LIMIT,
    )
    expect(selected.map((dot) => `${dot.yeas}–${dot.nays}`)).toEqual(['210–208', '212–206', '218–201'])
    expect(selected.some((dot) => dot.yeas === 421 && dot.nays === 1)).toBe(false)
  })

  it('caps rendered rows at 4 House and 3 Senate', () => {
    const house = Array.from({ length: 8 }, (_, index) =>
      makeTightnessDot({
        roll_number: 8100 + index,
        bill_number: 200 + index,
        yeas: 210 + index,
        nays: 208,
        vote_date: '2026-07-22',
      }),
    )
    const senate = Array.from({ length: 6 }, (_, index) =>
      makeTightnessDot({
        kind: 'nominee',
        chamber: 'Senate',
        roll_number: 9100 + index,
        yeas: 51 + index,
        nays: 49,
        bill_type: null,
        bill_number: null,
        nominee_name: `Nominee ${index}`,
      }),
    )
    expect(selectClosestVotes(house, HOUSE_MARGIN_CAP, HOUSE_CLOSEST_LIMIT)).toHaveLength(4)
    expect(selectClosestVotes(senate, SENATE_MARGIN_CAP, SENATE_CLOSEST_LIMIT)).toHaveLength(3)
  })
})

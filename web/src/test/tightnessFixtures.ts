import type { SenateWaitingBill, TightnessDot, TightnessStatsResponse } from '../api/types'

export function makeTightnessDot(overrides: Partial<TightnessDot> = {}): TightnessDot {
  return {
    kind: 'bill',
    chamber: 'House',
    congress: 119,
    session: 2,
    roll_number: 9010,
    vote_date: '2026-07-22',
    yeas: 210,
    nays: 208,
    yea_pct: 210 / 418,
    cohesion: 'party-line',
    party_splits: [
      { party: 'R', yeas: 207, nays: 5, party_line: 'yea' },
      { party: 'D', yeas: 2, nays: 203, party_line: 'nay' },
    ],
    member_votes_available: true,
    bill_type: 'HR',
    bill_number: 88,
    headline: 'House passes a knife-edge resolution (local sample)',
    nominee_name: null,
    position_title: null,
    ...overrides,
  }
}

export function makeSenateWaitingBill(
  overrides: Partial<SenateWaitingBill> = {},
): SenateWaitingBill {
  return {
    congress: 119,
    bill_type: 'HR',
    bill_number: 33,
    headline: 'House-passed contracting bill waiting in the Senate (local sample)',
    title: 'Sample Senate-waiting Act (local sample)',
    senate_committee: 'Health, Education, Labor, and Pensions Committee',
    current_label: 'In Health, Education, Labor, and Pensions Committee · waiting for the committee to act',
    house_passage_date: '2026-07-21',
    text_grew: false,
    ...overrides,
  }
}

/**
 * Production House lookback is bimodal: a chained 4% cluster of knife-edge
 * rolls near 50% yea plus steamrolls near 100%. Used to prove stagger stays
 * inside the ~2.25rem track instead of stacking onto the row labels.
 */
export function makeBimodalHouseDots(): TightnessDot[] {
  const knifeEdge = [
    0.5023, 0.5024, 0.5035, 0.5047, 0.5071, 0.5072, 0.5176, 0.5203, 0.5277, 0.534, 0.5395, 0.5524,
  ]
  const steamrolls = [0.9742, 0.9792, 0.985, 0.9952, 0.9976, 1]
  return [...knifeEdge, ...steamrolls].map((yea_pct, index) => {
    const total = 420
    const yeas = Math.round(yea_pct * total)
    return makeTightnessDot({
      roll_number: 8000 + index,
      bill_number: 100 + index,
      yeas,
      nays: total - yeas,
      yea_pct,
      cohesion: yea_pct > 0.9 ? 'bipartisan' : 'party-line',
      headline: `House sample roll ${8000 + index}`,
    })
  })
}

export function makeTightnessStats(
  overrides: Partial<TightnessStatsResponse> = {},
): TightnessStatsResponse {
  return {
    congress: 119,
    session: 2,
    as_of: '2026-07-23T00:00:00.000Z',
    house_passage: [
      makeTightnessDot(),
      makeTightnessDot({
        roll_number: 9011,
        yeas: 421,
        nays: 1,
        yea_pct: 421 / 422,
        cohesion: 'bipartisan',
        party_splits: [
          { party: 'R', yeas: 218, nays: 0, party_line: 'yea' },
          { party: 'D', yeas: 203, nays: 1, party_line: 'yea' },
        ],
        bill_number: 33,
        headline: 'House-passed contracting bill waiting in the Senate (local sample)',
        vote_date: '2026-07-21',
      }),
    ],
    senate: [
      makeTightnessDot({
        kind: 'nominee',
        chamber: 'Senate',
        roll_number: 9101,
        yeas: 58,
        nays: 40,
        yea_pct: 58 / 98,
        cohesion: 'party-line',
        party_splits: [
          { party: 'R', yeas: 53, nays: 0, party_line: 'yea' },
          { party: 'D', yeas: 5, nays: 40, party_line: 'nay' },
        ],
        bill_type: null,
        bill_number: null,
        headline: 'Jane Doe confirmed as Energy Secretary (local sample)',
        nominee_name: 'Jane Doe',
        position_title: 'Secretary of Energy',
        vote_date: '2026-07-22',
      }),
      makeTightnessDot({
        kind: 'bill',
        chamber: 'Senate',
        roll_number: 9002,
        yeas: 68,
        nays: 32,
        yea_pct: 68 / 100,
        cohesion: 'bipartisan',
        party_splits: [
          { party: 'R', yeas: 40, nays: 10, party_line: 'yea' },
          { party: 'D', yeas: 28, nays: 22, party_line: 'yea' },
        ],
        bill_type: 'S',
        bill_number: 47,
        headline: 'Senate passes a public lands conservation and access bill (local sample)',
        nominee_name: null,
        vote_date: '2026-07-18',
      }),
    ],
    senate_waiting: [makeSenateWaitingBill()],
    ...overrides,
  }
}

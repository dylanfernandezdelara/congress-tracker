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
    result: 'Passed',
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
        roll_number: 9103,
        yeas: 51,
        nays: 49,
        result: 'Confirmed',
        yea_pct: 51 / 100,
        cohesion: 'party-line',
        party_splits: [
          { party: 'R', yeas: 51, nays: 2, party_line: 'yea' },
          { party: 'D', yeas: 0, nays: 47, party_line: 'nay' },
        ],
        bill_type: null,
        bill_number: null,
        headline: 'Alex Roe confirmed as Deputy Secretary (local sample)',
        nominee_name: 'Alex Roe',
        position_title: 'Deputy Secretary',
        vote_date: '2026-07-22',
      }),
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

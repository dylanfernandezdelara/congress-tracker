import { describe, expect, it } from 'vitest'

import { compareRaces, guideSections, raceTitle } from './present'
import type { ElectionRace, RaceRatingLabel, StateElectionGuide } from './types'

const src = { label: 'x', url: 'https://example.org', checked: '2026-10-18' }

function race(
  id: string,
  office: ElectionRace['office'],
  district: number | null,
  rating: RaceRatingLabel | null,
  special = false
): ElectionRace {
  return {
    id,
    state: 'PA',
    office,
    district,
    special,
    open_seat: false,
    rating: rating ? { label: rating, rated_on: '2026-10-01', source: src } : null,
    candidates: [],
    note: null,
    sources: [src],
  }
}

describe('guideSections', () => {
  it('puts Toss-up and Lean races first, then statewide, then House by district', () => {
    const guide: StateElectionGuide = {
      state: 'PA',
      status: 'verified',
      election_office: null,
      ballot_lookup_url: null,
      updated: null,
      races: [
        race('PA-H-10', 'house', 10, 'Toss-up'),
        race('PA-H-03', 'house', 3, 'Safe D'),
        race('PA-GOV', 'governor', null, 'Likely D'),
        race('PA-H-01', 'house', 1, 'Lean R'),
        race('PA-H-02', 'house', 2, null),
      ],
    }
    const s = guideSections(guide)
    expect(s.competitive.map((r) => r.id)).toEqual(['PA-H-01', 'PA-H-10'])
    expect(s.statewide.map((r) => r.id)).toEqual(['PA-GOV'])
    expect(s.house.map((r) => r.id)).toEqual(['PA-H-02', 'PA-H-03'])
  })

  it('orders a special after the regular race for the same seat', () => {
    const regular = race('TX-H-18', 'house', 18, null)
    const special = race('TX-H-18-SPECIAL', 'house', 18, null, true)
    expect([special, regular].sort(compareRaces).map((r) => r.id)).toEqual(['TX-H-18', 'TX-H-18-SPECIAL'])
  })
})

describe('raceTitle', () => {
  it('names each office', () => {
    expect(raceTitle(race('GA-S', 'senate', null, null))).toBe('U.S. Senate')
    expect(raceTitle(race('OH-S-SPECIAL', 'senate', null, null, true))).toBe('U.S. Senate (special)')
    expect(raceTitle(race('PA-GOV', 'governor', null, null))).toBe('Governor')
    expect(raceTitle(race('PA-H-07', 'house', 7, null))).toBe('U.S. House · District 7')
    expect(raceTitle(race('AK-H-00', 'house', 0, null))).toBe('U.S. House · At-large')
  })
})

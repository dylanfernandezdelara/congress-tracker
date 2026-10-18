import { describe, expect, it } from 'vitest'

import { STATE_GUIDES_2026 } from './index'
import type { ElectionCandidate, ElectionRace, ElectionSource } from './types'

/** 2020 apportionment. DC elects one non-voting delegate (district 0). */
const HOUSE_SEATS: Record<string, number> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14, HI: 2, ID: 2, IL: 17,
  IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8, MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2,
  NE: 3, NV: 4, NH: 2, NJ: 12, NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2,
  SC: 7, SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1, DC: 1,
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv'])

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => !SUFFIXES.has(p.toLowerCase().replace(/,$/, '')))
  return (parts[parts.length - 1] ?? '').toLowerCase()
}

function expectSources(sources: ElectionSource[], where: string) {
  expect(sources.length, `${where}: needs a source`).toBeGreaterThan(0)
  for (const s of sources) {
    expect(s.url, `${where}: source url`).toMatch(/^https:\/\//)
    expect(s.checked, `${where}: checked day`).toMatch(ISO_DAY)
  }
}

function expectRaceId(race: ElectionRace) {
  if (race.office === 'house') {
    const d = String(race.district ?? -1).padStart(2, '0')
    expect(race.id).toBe(`${race.state}-H-${d}`)
  } else if (race.office === 'senate') {
    expect(race.id).toBe(race.special ? `${race.state}-S-SPECIAL` : `${race.state}-S`)
    expect(race.district).toBeNull()
  } else {
    expect(race.id).toBe(`${race.state}-GOV`)
    expect(race.district).toBeNull()
  }
}

function expectCandidate(c: ElectionCandidate, where: string) {
  expect(c.name.trim(), `${where}: name`).not.toBe('')
  if (c.bioguide_id != null) expect(c.bioguide_id, `${where}: bioguide`).toMatch(/^[A-Z]\d{6}$/)
  if (c.fec_candidate_id != null) expect(c.fec_candidate_id, `${where}: FEC id`).toMatch(/^[HSP]\d[A-Z0-9]{7}$/)
  if (c.website != null) expect(c.website, `${where}: website`).toMatch(/^https?:\/\//)
  expectSources(c.sources, where)
}

describe('2026 state election guides', () => {
  it('has a guide for every state and DC', () => {
    expect(Object.keys(STATE_GUIDES_2026).sort()).toEqual(Object.keys(HOUSE_SEATS).sort())
    for (const [code, guide] of Object.entries(STATE_GUIDES_2026)) expect(guide.state).toBe(code)
  })

  for (const [code, guide] of Object.entries(STATE_GUIDES_2026)) {
    if (guide.status === 'pending') continue

    describe(code, () => {
      it('has an election office, a ballot lookup and an update day', () => {
        expect(guide.election_office?.url).toMatch(/^https:\/\//)
        expect(guide.ballot_lookup_url).toMatch(/^https:\/\//)
        expect(guide.updated).toMatch(ISO_DAY)
      })

      it('lists every House seat exactly once', () => {
        const districts = guide.races.filter((r) => r.office === 'house').map((r) => r.district)
        const seats = HOUSE_SEATS[code]
        const expected = seats === 1 ? [0] : Array.from({ length: seats }, (_, i) => i + 1)
        expect([...districts].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(expected)
      })

      it('has well-formed, sourced races', () => {
        const ids = guide.races.map((r) => r.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const race of guide.races) {
          expect(race.state).toBe(code)
          expectRaceId(race)
          expectSources(race.sources, race.id)
          if (race.rating) expectSources([race.rating.source], `${race.id} rating`)
          expect(race.candidates.length, `${race.id}: candidates`).toBeGreaterThan(0)
          const incumbents = race.candidates.filter((c) => c.incumbent).length
          expect(incumbents, `${race.id}: incumbents`).toBeLessThanOrEqual(race.office === 'house' ? 2 : 1)
          expect(race.open_seat, `${race.id}: open_seat vs incumbents`).toBe(incumbents === 0)
          race.candidates.forEach((c) => expectCandidate(c, `${race.id} ${c.name}`))
          const names = race.candidates.map((c) => lastName(c.name))
          expect(names, `${race.id}: candidates sorted by last name`).toEqual([...names].sort())
        }
      })
    })
  }
})

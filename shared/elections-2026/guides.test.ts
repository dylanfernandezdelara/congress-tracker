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
const PARTY_CODES = new Set(['D', 'R', 'I', 'L', 'G', 'Other'])
const BALLOT_STATUSES = new Set(['active', 'withdrawn', 'deceased'])
const RATINGS = new Set(['Toss-up', 'Lean D', 'Lean R', 'Likely D', 'Likely R', 'Safe D', 'Safe R'])
const OFFICES = new Set(['senate', 'house', 'governor'])

const bySortName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' })

function expectSources(sources: ElectionSource[], where: string) {
  expect(sources.length, `${where}: needs a source`).toBeGreaterThan(0)
  for (const s of sources) {
    expect(s.url, `${where}: source url`).toMatch(/^https:\/\//)
    expect(s.checked, `${where}: checked day`).toMatch(ISO_DAY)
  }
}

function expectRaceId(race: ElectionRace) {
  expect(OFFICES.has(race.office), `${race.id}: office`).toBe(true)
  if (race.office === 'house') {
    const d = String(race.district ?? -1).padStart(2, '0')
    expect(race.id).toBe(`${race.state}-H-${d}${race.special ? '-SPECIAL' : ''}`)
  } else if (race.office === 'senate') {
    expect(race.id).toBe(race.special ? `${race.state}-S-SPECIAL` : `${race.state}-S`)
    expect(race.district).toBeNull()
  } else {
    expect(race.id).toBe(`${race.state}-GOV`)
    expect(race.district).toBeNull()
    expect(race.special).toBe(false)
  }
}

function expectCandidate(c: ElectionCandidate, race: ElectionRace, where: string) {
  expect(c.name.trim(), `${where}: name`).not.toBe('')
  expect(c.sort_name, `${where}: sort_name is "Last, First"`).toMatch(/^[^,]+, .+/)
  expect(c.parties.length, `${where}: parties`).toBeGreaterThan(0)
  expect(PARTY_CODES.has(c.party_code), `${where}: party_code ${c.party_code}`).toBe(true)
  expect(BALLOT_STATUSES.has(c.ballot_status), `${where}: ballot_status ${c.ballot_status}`).toBe(true)
  if (c.bioguide_id != null) expect(c.bioguide_id, `${where}: bioguide`).toMatch(/^[A-Z]\d{6}$/)
  if (race.office === 'governor') {
    expect(c.fec_candidate_id, `${where}: no FEC id for governor`).toBeNull()
  } else if (c.fec_candidate_id != null) {
    const prefix = race.office === 'house' ? 'H' : 'S'
    // House ids carry the state; Senate ids do too (e.g. S6OH00163).
    expect(c.fec_candidate_id, `${where}: FEC id for this office and state`).toMatch(
      new RegExp(`^${prefix}\\d${race.state}[A-Z0-9]{5}$`)
    )
  }
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
        const districts = guide.races.filter((r) => r.office === 'house' && !r.special).map((r) => r.district)
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
          if (race.rating) {
            expect(RATINGS.has(race.rating.label), `${race.id}: rating ${race.rating.label}`).toBe(true)
            expect(race.rating.rated_on, `${race.id}: rated_on`).toMatch(ISO_DAY)
            expectSources([race.rating.source], `${race.id} rating`)
          }
          expect(race.candidates.length, `${race.id}: candidates`).toBeGreaterThan(0)
          const incumbents = race.candidates.filter((c) => c.incumbent).length
          expect(incumbents, `${race.id}: incumbents`).toBeLessThanOrEqual(race.office === 'house' ? 2 : 1)
          expect(race.open_seat, `${race.id}: open_seat vs incumbents`).toBe(incumbents === 0)
          race.candidates.forEach((c) => expectCandidate(c, race, `${race.id} ${c.name}`))
          const names = race.candidates.map((c) => c.sort_name)
          expect(names, `${race.id}: candidates sorted by sort_name`).toEqual([...names].sort(bySortName))
        }
      })
    })
  }
})

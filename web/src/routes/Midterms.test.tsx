import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ElectionsIndexResponse } from '@congress-tracker/shared/elections-2026/api-types'
import type { ElectionCandidate, StateElectionGuide } from '@congress-tracker/shared/elections-2026/types'

import Midterms from './Midterms'

// Made-up people and sources: this fixture tests layout only and is never real data.
const src = { label: 'Fixture', url: 'https://example.org/source', checked: '2026-10-18' }

function candidate(name: string, sort_name: string, extra: Partial<ElectionCandidate> = {}): ElectionCandidate {
  return {
    name,
    sort_name,
    parties: ['Independent'],
    party_code: 'I',
    ballot_status: 'active',
    incumbent: false,
    bioguide_id: null,
    current_office: null,
    fec_candidate_id: null,
    website: null,
    sources: [src],
    ...extra,
  }
}

const guide: StateElectionGuide = {
  state: 'PA',
  status: 'verified',
  election_office: { name: 'State election office', url: 'https://example.org/office' },
  ballot_lookup_url: 'https://example.org/lookup',
  updated: '2026-10-18',
  races: [
    {
      id: 'PA-H-02',
      state: 'PA',
      office: 'house',
      district: 2,
      special: false,
      open_seat: true,
      rating: null,
      candidates: [candidate('Alex Able', 'Able, Alex')],
      note: null,
      sources: [src],
    },
    {
      id: 'PA-H-07',
      state: 'PA',
      office: 'house',
      district: 7,
      special: false,
      open_seat: false,
      rating: { label: 'Toss-up', rated_on: '2026-10-09', source: src },
      candidates: [
        candidate('Casey Brook', 'Brook, Casey', { website: 'https://example.org/brook' }),
        candidate('Drew Cole', 'Cole, Drew', {
          incumbent: true,
          bioguide_id: 'C000001',
          party_code: 'R',
          parties: ['Republican'],
          fec_candidate_id: 'H4PA07001',
        }),
      ],
      note: null,
      sources: [src],
    },
  ],
}

const index: ElectionsIndexResponse = {
  election_day: '2026-11-03',
  states: [
    { code: 'PA', name: 'Pennsylvania', status: 'verified', races: 2, competitive: 1 },
    { code: 'OH', name: 'Ohio', status: 'pending', races: 0, competitive: 0 },
  ],
}

const api = vi.hoisted(() => ({
  fetchElectionsIndex: vi.fn(),
  fetchElectionsLocate: vi.fn(),
  fetchStateGuide: vi.fn(),
}))
vi.mock('../api/elections', () => api)

function Where() {
  return <span data-testid="path">{useLocation().pathname}</span>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/midterms/:state?" element={<><Midterms /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  api.fetchElectionsIndex.mockResolvedValue(index)
  api.fetchElectionsLocate.mockResolvedValue({ state: null })
  api.fetchStateGuide.mockImplementation(async (code: string) =>
    code === 'PA' ? guide : { state: code, status: 'pending', election_office: null, ballot_lookup_url: null, races: [], updated: null },
  )
})

afterEach(() => vi.clearAllMocks())

describe('Midterms', () => {
  it('shows competitive races first, candidates alphabetically, with factual links', async () => {
    renderAt('/midterms/pa')

    const competitive = await screen.findByRole('region', { name: 'Competitive races' })
    const race = within(competitive).getByRole('article', { name: 'U.S. House · District 7' })
    expect(within(race).getByText(/Toss-up/)).toBeTruthy()
    const names = within(race).getAllByText(/^(Casey Brook|Drew Cole)$/).map((el) => el.textContent)
    expect(names).toEqual(['Casey Brook', 'Drew Cole'])
    expect(within(race).getByRole('button', { name: 'Open profile for Drew Cole' })).toBeTruthy()
    expect(within(race).getByRole('link', { name: 'FEC filings' }).getAttribute('href')).toBe(
      'https://www.fec.gov/data/candidate/H4PA07001/',
    )
    expect(within(race).getByRole('link', { name: 'Campaign site' })).toBeTruthy()

    const house = screen.getByRole('region', { name: 'U.S. House' })
    expect(within(house).getByText('Open seat')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Find your district and sample ballot' })).toBeTruthy()
  })

  it('opens on the state guessed from location and says so', async () => {
    api.fetchElectionsLocate.mockResolvedValue({ state: 'PA' })
    renderAt('/midterms')

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/midterms/PA'))
    expect(await screen.findByText('Based on your location')).toBeTruthy()
  })

  it('prefers a saved choice over location', async () => {
    localStorage.setItem('midterms_state', 'OH')
    api.fetchElectionsLocate.mockResolvedValue({ state: 'PA' })
    renderAt('/midterms')

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/midterms/OH'))
    expect(api.fetchElectionsLocate).not.toHaveBeenCalled()
    expect(await screen.findByText(/still checking every candidate in Ohio/)).toBeTruthy()
  })

  it('asks for a state when location is unknown', async () => {
    renderAt('/midterms')
    expect(await screen.findByRole('option', { name: 'Pick your state' })).toBeTruthy()
    expect(screen.getByTestId('path').textContent).toBe('/midterms')
  })
})

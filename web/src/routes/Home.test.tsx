import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BriefingFeedItem, BriefingFeedResponse } from '../api'
import Home from './Home'

const RealDate = Date
const { fetchLatestBriefing } = vi.hoisted(() => ({
  fetchLatestBriefing: vi.fn<() => Promise<BriefingFeedResponse>>(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    fetchLatestBriefing,
  }
})

function makeItem(overrides: Partial<BriefingFeedItem> = {}): BriefingFeedItem {
  return {
    id: 'vote-201',
    congress: 119,
    session: 2,
    vote_number: 201,
    vote_date: '2026-03-08',
    title: 'Emergency funding resolution',
    summary: 'Provides emergency supplemental funding for a federal response program.',
    outcome_label: 'The measure passed with bipartisan support.',
    status: 'passed',
    category: 'Appropriations',
    significance: 'high',
    tally: {
      yea: 61,
      nay: 39,
      present: 0,
      absent: 0,
    },
    crossed_party_lines: [],
    source_coverage: {
      level: 'full',
      vote_data: true,
      bill_context: true,
      congressional_record: true,
      floor_logs: true,
      model_summary: true,
    },
    detail_path: '/votes/201',
    plain_action: 'The Senate passed the measure.',
    public_impact_summary: 'Provides emergency supplemental funding for a federal response program.',
    content_confidence: 'high',
    source_basis: ['official_bill_summary', 'vote_question'],
    ...overrides,
  }
}

function makeBriefing(items: BriefingFeedItem[]): BriefingFeedResponse {
  return {
    generated_at: '2026-03-10T14:30:00Z',
    source: 'd1',
    items,
  }
}

function freezeDate(isoNow: string): void {
  const fixedNow = new RealDate(isoNow)

  class MockDate extends RealDate {
    constructor(value?: ConstructorParameters<typeof Date>[0]) {
      super(value ?? fixedNow.toISOString())
    }

    static now(): number {
      return fixedNow.getTime()
    }
  }

  vi.stubGlobal('Date', MockDate)
}

describe('Home', () => {
  beforeEach(() => {
    freezeDate('2026-03-10T12:00:00-04:00')
    window.history.pushState({}, '', '/')
    fetchLatestBriefing.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to older ledger votes when none fall inside the freshness window', async () => {
    fetchLatestBriefing.mockResolvedValue(
      makeBriefing([
        makeItem({
          id: 'vote-101',
          vote_number: 101,
          vote_date: '2026-01-05',
          title: 'War powers resolution',
          detail_path: '/votes/101',
        }),
      ]),
    )

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Washington,\s*D\.C\./)).toBeInTheDocument()
    expect(screen.getByText('Older votes in the ledger')).toBeInTheDocument()
    expect(screen.getByText('War powers resolution')).toBeInTheDocument()
  })

  it('loads fixture briefing without calling fetchLatestBriefing when ?e2e=1', async () => {
    window.history.pushState({}, '', '/?e2e=1')

    render(
      <MemoryRouter initialEntries={['/?e2e=1']}>
        <Home />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Review mode')).toBeInTheDocument()
    expect(fetchLatestBriefing).not.toHaveBeenCalled()
  })

  it('shows a recent vote as the lead briefing item when it falls inside the freshness window', async () => {
    fetchLatestBriefing.mockResolvedValue(
      makeBriefing([
        makeItem({
          id: 'vote-205',
          vote_number: 205,
          vote_date: '2026-03-09',
          title: 'Rail safety package',
          detail_path: '/votes/205',
        }),
      ]),
    )

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Washington,\s*D\.C\./)).toBeInTheDocument()
    expect(screen.getByText('Rail safety package')).toBeInTheDocument()
    expect(screen.queryByText('Older votes in the ledger')).not.toBeInTheDocument()
  })
})
